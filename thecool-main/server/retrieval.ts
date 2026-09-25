/**
 * Retrieval layer: real Moss (in-process semantic search) with a local fallback.
 *
 * - If MOSS_PROJECT_ID and MOSS_PROJECT_KEY are set, the index is created (or synced)
 *   in Moss Cloud on startup, downloaded with loadIndex(), and every query then runs
 *   inside this process (no network hop on the hot path).
 * - If Moss is not configured or unreachable, queries are served by the local keyword
 *   index and every response says so (backend: 'local').
 *
 * Keys never leave the server.
 */

import { KNOWLEDGE_BASE, KnowledgeDoc } from './knowledge.js';
import { MossEngine, MossSearchResponse, MossSearchResult } from './moss.js';
import type { Embedder } from './embeddings.js';

/**
 * disabled     Moss not configured -> local keyword fallback
 * initializing connecting / building index
 * ready        index loaded in-process (fastest path, single-digit ms)
 * cloud        Moss reachable but loadIndex() failed (e.g. model download 401); queries go over the
 *              network to Moss Cloud. Still real Moss semantic search, just slower. Retries loadIndex.
 * error        Moss unreachable -> local keyword fallback
 */
export type MossState = 'disabled' | 'initializing' | 'ready' | 'cloud' | 'error';
export type RetrievalMode = 'in-process' | 'cloud' | 'local';

export interface RetrieverStatus {
  configured: boolean;
  state: MossState;
  activeBackend: 'moss' | 'local';
  mode: RetrievalMode;
  indexName: string;
  docCount: number;
  error?: string;
  /** Where embeddings come from: Moss's own model, or our local model (bring-your-own vectors). */
  embeddings?: string;
}

export interface LatencyStats {
  backend: 'moss' | 'local';
  count: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

const MAX_SAMPLES = 500;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function docToIndexText(doc: KnowledgeDoc): string {
  return [doc.title + '.', doc.summary, doc.content, doc.actionableProtocol ? `Action: ${doc.actionableProtocol}` : '']
    .filter(Boolean)
    .join(' ');
}

export function docsForMoss(docs: KnowledgeDoc[] = KNOWLEDGE_BASE, vectors?: number[][]) {
  return docs.map((d, i) => ({
    id: d.id,
    text: docToIndexText(d),
    ...(vectors ? { embedding: vectors[i] } : {}),
    metadata: { category: d.category, title: d.title, tags: d.tags.join(',') },
    // Full original record travels with the document so results map back exactly.
    payload: JSON.stringify(d),
  }));
}

export class Retriever {
  private docs: KnowledgeDoc[];
  private byId: Map<string, KnowledgeDoc>;
  private local: MossEngine;
  private client: any = null;
  private state: MossState = 'disabled';
  private error: string | undefined;
  private samples: Record<'moss' | 'local', number[]> = { moss: [], local: [] };
  private retryTimer: NodeJS.Timeout | null = null;
  private reinitTimer: NodeJS.Timeout | null = null;
  private initializing = false;
  private embedder: Embedder | null = null;
  private readonly localEmbeddings: boolean;
  private forcedBackend: 'auto' | 'moss' | 'local' = 'auto';

  readonly indexName: string;
  private readonly projectId: string | undefined;
  private readonly projectKey: string | undefined;
  private readonly alpha: number;
  private readonly alphaFromEnv: boolean;

  constructor(docs: KnowledgeDoc[] = KNOWLEDGE_BASE) {
    this.docs = docs;
    this.byId = new Map(docs.map((d) => [d.id, d]));
    this.local = new MossEngine(docs);
    this.projectId = process.env.MOSS_PROJECT_ID?.trim() || undefined;
    this.projectKey = process.env.MOSS_PROJECT_KEY?.trim() || undefined;
    this.indexName = process.env.MOSS_INDEX_NAME?.trim() || 'neuralflow-kb';
    // MOSS_EMBEDDINGS=local: we compute vectors ourselves, so Moss never has to download its model.
    this.localEmbeddings = (process.env.MOSS_EMBEDDINGS || 'moss').trim().toLowerCase() === 'local';
    const a = Number(process.env.MOSS_ALPHA);
    this.alphaFromEnv = Number.isFinite(a) && a >= 0 && a <= 1 && process.env.MOSS_ALPHA !== undefined && process.env.MOSS_ALPHA !== '';
    this.alpha = Number.isFinite(a) && a >= 0 && a <= 1 ? a : 0.7;
    if (this.projectId && this.projectKey) this.state = 'initializing';
  }

  get configured(): boolean {
    return Boolean(this.projectId && this.projectKey);
  }

  getForcedBackend(): 'auto' | 'moss' | 'local' {
    return this.forcedBackend;
  }

  setForcedBackend(mode: 'auto' | 'moss' | 'local'): void {
    this.forcedBackend = mode;
  }

  status(): RetrieverStatus & { forcedBackend: 'auto' | 'moss' | 'local' } {
    const naturalBackend: 'moss' | 'local' = this.state === 'ready' || this.state === 'cloud' ? 'moss' : 'local';
    // Report the backend that will actually serve queries: forcing 'moss' while Moss is down still serves locally.
    const activeBackend: 'moss' | 'local' = this.forcedBackend === 'local' ? 'local' : naturalBackend;
    // When forced to moss but not ready, mode stays as natural until ready; forced local always shows local
    const effectiveMode = this.forcedBackend === 'local' ? 'local' : this.forcedBackend === 'moss' && naturalBackend === 'local' ? 'local' : this.mode();
    return {
      configured: this.configured,
      state: this.state,
      activeBackend,
      mode: effectiveMode as RetrievalMode,
      indexName: this.indexName,
      docCount: this.docs.length,
      error: this.error,
      embeddings: this.localEmbeddings ? (this.embedder?.name ?? 'local (loading...)') : 'moss-managed',
      forcedBackend: this.forcedBackend,
    };
  }

  /** With the lexical hashing embedder the vector side is weak, so lean on Moss's keyword side. */
  private effectiveAlpha(): number {
    if (!this.alphaFromEnv && this.embedder && !this.embedder.semantic) return Math.min(this.alpha, 0.3);
    return this.alpha;
  }

  private mode(): RetrievalMode {
    return this.state === 'ready' ? 'in-process' : this.state === 'cloud' ? 'cloud' : 'local';
  }

  stats(): LatencyStats[] {
    return (['moss', 'local'] as const).map((backend) => {
      const s = [...this.samples[backend]].sort((a, b) => a - b);
      return {
        backend,
        count: s.length,
        p50: s.length ? round(percentile(s, 50)) : null,
        p95: s.length ? round(percentile(s, 95)) : null,
        max: s.length ? round(s[s.length - 1]) : null,
      };
    });
  }

  /** Connect to Moss, create/sync the index, load it into memory. Never throws. */
  async init(): Promise<void> {
    if (!this.configured) {
      this.state = 'disabled';
      console.log('[retrieval] MOSS_PROJECT_ID / MOSS_PROJECT_KEY not set, using local keyword fallback.');
      return;
    }
    this.initializing = true;
    this.state = 'initializing';
    try {
      const mod: any = await import('@moss-dev/moss');
      this.client = new mod.MossClient(this.projectId, this.projectKey);

      const indexes: Array<{ name: string; docCount: number; status?: string }> = await this.client.listIndexes();
      const existing = indexes.find((i) => i.name === this.indexName);
      if (this.localEmbeddings && !this.embedder) {
        const { createEmbedder } = await import('./embeddings.js');
        this.embedder = await createEmbedder();
      }
      const payload = await this.buildPayload(this.docs);

      if (this.localEmbeddings && existing) {
        const model = (existing as any).model?.id;
        if (model && model !== 'custom') {
          throw new Error(
            `Index "${this.indexName}" uses Moss model "${model}", which local-embedding mode cannot query. ` +
              `Set MOSS_INDEX_NAME to a NEW name (for example ${this.indexName}-byo) and the app will create it.`
          );
        }
      }

      if (!existing) {
        const modelId = process.env.MOSS_MODEL_ID?.trim() || undefined; // e.g. moss-mediumlm; default moss-minilm
        console.log(`[retrieval] Creating Moss index "${this.indexName}" with ${payload.length} docs (model: ${modelId ?? 'default'})...`);
        await this.client.createIndex(this.indexName, payload, modelId ? { modelId } : undefined);
      } else {
        console.log(`[retrieval] Index "${this.indexName}" exists (status: ${existing.status ?? 'unknown'}, docs: ${existing.docCount}).`);
        await this.syncMissingDocs(payload);
      }

      if (this.localEmbeddings) {
        // Bring-your-own-embeddings path: loadIndex needs no Moss model download.
        await this.client.loadIndex(this.indexName);
        const warm = await this.embedder!.embed('warm up');
        await this.client.query(this.indexName, 'warm up', { topK: 1, alpha: this.effectiveAlpha(), embedding: warm });
        this.state = 'ready';
        this.error = undefined;
        console.log(`[retrieval] Moss ready: index "${this.indexName}" loaded in-process with local embeddings (${this.embedder!.name}).`);
        return;
      }

      try {
        await this.client.loadIndex(this.indexName);
        await this.client.query(this.indexName, 'warm up', { topK: 1, alpha: this.effectiveAlpha() }); // warm-up
        this.state = 'ready';
        this.error = undefined;
        console.log(`[retrieval] Moss ready: index "${this.indexName}" loaded in-process.`);
      } catch (loadErr: any) {
        // loadIndex needs to download the embedding model; if that fails (e.g. HTTP 401) we can still
        // query the index through Moss Cloud. Slower (network), but still real Moss semantic search.
        const loadMsg = sanitize(loadErr);
        console.error('[retrieval] loadIndex failed:', loadMsg);
        await this.queryWithRetry('warm up', 1); // throws if cloud also fails after retries
        this.state = 'cloud';
        this.error = `In-process load failed (${loadMsg}). Using Moss Cloud queries (network latency).`;
        console.warn('[retrieval] Using Moss Cloud queries; will retry in-process load every 60s.');
        this.scheduleRetry();
      }
    } catch (err: any) {
      this.state = 'error';
      this.error = sanitize(err);
      console.error('[retrieval] Moss init failed, using local fallback:', this.error);
      this.scheduleReinit();
    } finally {
      this.initializing = false;
    }
  }

  private async buildPayload(docs: KnowledgeDoc[]) {
    if (!this.localEmbeddings || !this.embedder) return docsForMoss(docs);
    const vectors: number[][] = [];
    for (const d of docs) vectors.push(await this.embedder.embed(docToIndexText(d)));
    return docsForMoss(docs, vectors);
  }

  /**
   * Adds only the documents that are missing from the index. Never deletes, and never rewrites
   * documents that are already there, so repeated starts do not trigger index rebuilds.
   * Set MOSS_FORCE_SYNC=1 to upsert everything (after you edit server/knowledge.ts).
   */
  private async syncMissingDocs(payload: ReturnType<typeof docsForMoss>): Promise<void> {
    if (process.env.MOSS_FORCE_SYNC === '1') {
      console.log(`[retrieval] MOSS_FORCE_SYNC=1: upserting all ${payload.length} docs.`);
      await this.client.addDocs(this.indexName, payload);
      return;
    }
    let present = new Set<string>();
    try {
      const found: Array<{ id: string }> = await this.client.getDocs(this.indexName, { docIds: payload.map((d) => d.id) });
      present = new Set(found.map((d) => d.id));
    } catch (err: any) {
      console.warn('[retrieval] Could not check which docs exist, skipping sync:', sanitize(err));
      return;
    }
    const missing = payload.filter((d) => !present.has(d.id));
    if (missing.length === 0) {
      console.log('[retrieval] Index already contains all knowledge-base documents; nothing to write.');
      return;
    }
    console.log(`[retrieval] Adding ${missing.length} missing docs to "${this.indexName}"...`);
    await this.client.addDocs(this.indexName, missing);
  }

  /** Moss Cloud can answer 503 while an index is (re)building, so retry a few times. */
  private async queryWithRetry(text: string, topK: number): Promise<any> {
    const delays = [700, 2000, 4000];
    let lastErr: any;
    for (let i = 0; i <= delays.length; i++) {
      try {
        return await this.client.query(this.indexName, text, { topK, alpha: this.effectiveAlpha() });
      } catch (err: any) {
        lastErr = err;
        if (i < delays.length) await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
    throw lastErr;
  }

  /** If Moss was unreachable at startup, try again every 60s so the app upgrades without a restart. */
  private scheduleReinit() {
    if (this.reinitTimer) return;
    this.reinitTimer = setInterval(async () => {
      if (this.state !== 'error' || this.initializing) return;
      this.initializing = true;
      await this.init();
      if (this.state !== 'error' && this.reinitTimer) {
        clearInterval(this.reinitTimer);
        this.reinitTimer = null;
        console.log(`[retrieval] Moss recovered (${this.mode()} mode).`);
      }
    }, 60_000);
    this.reinitTimer.unref?.();
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(async () => {
      if (this.state !== 'cloud' || !this.client) return;
      try {
        await this.client.loadIndex(this.indexName);
        this.state = 'ready';
        this.error = undefined;
        console.log('[retrieval] Moss in-process load succeeded on retry. Now serving queries locally.');
        if (this.retryTimer) clearInterval(this.retryTimer);
        this.retryTimer = null;
      } catch {
        /* keep using cloud queries */
      }
    }, 60_000);
    this.retryTimer.unref?.();
  }

  async search(query: string, limit = 3): Promise<MossSearchResponse> {
    // Manual Retrieval Mode override: forced 'local' bypasses Moss entirely
    if (this.forcedBackend === 'local') {
      const local = this.local.search(query, limit);
      this.record('local', local.latencyMs);
      return local;
    }
    if ((this.state === 'ready' || this.state === 'cloud') && this.client) {
      const t0 = process.hrtime.bigint();
      try {
        let embedMs: number | undefined;
        let queryOptions: any = { topK: limit, alpha: this.effectiveAlpha() };
        if (this.localEmbeddings && this.embedder) {
          const e0 = process.hrtime.bigint();
          queryOptions = { ...queryOptions, embedding: await this.embedder.embed(query) };
          embedMs = Number(process.hrtime.bigint() - e0) / 1_000_000;
        }
        const s0 = process.hrtime.bigint();
        const res = await this.client.query(this.indexName, query, queryOptions);
        const searchMs = Number(process.hrtime.bigint() - s0) / 1_000_000;
        const wall = Number(process.hrtime.bigint() - t0) / 1_000_000;
        const inProcess = this.state === 'ready';
        // Report the whole retrieval step as experienced: embedding (if local) + Moss search, or the
        // network round trip in cloud mode.
        const reported =
          this.localEmbeddings ? wall : inProcess && typeof res.timeTakenInMs === 'number' ? res.timeTakenInMs : wall;

        const results: MossSearchResult[] = [];
        for (const d of res.docs ?? []) {
          const doc = this.parseDoc(d) ?? this.byId.get(d.id);
          if (doc) results.push({ document: doc, score: round(d.score, 3), matchedTerms: [] });
        }

        this.record('moss', wall);
        return {
          query,
          results,
          latencyMs: round(reported),
          latencyMicroseconds: Math.round(reported * 1000),
          wallClockMs: round(wall),
          ...(embedMs !== undefined ? { embedMs: round(embedMs), searchMs: round(searchMs) } : {}),
          backend: 'moss',
          mode: inProcess ? 'in-process' : 'cloud',
          retrievalEngine: inProcess
            ? this.localEmbeddings
              ? `Moss in-process, local embeddings (${this.embedder?.name})`
              : 'Moss (semantic + keyword hybrid, in-process)'
            : 'Moss Cloud (network query; in-process model load unavailable)',
          sub10msGuaranteed: wall < 10,
          totalDocsIndexed: this.docs.length,
          timestamp: new Date().toISOString(),
        };
      } catch (err: any) {
        // A failed query must never break the conversation: fall back for this call.
        this.error = sanitize(err);
        console.error('[retrieval] Moss query failed, serving from local fallback:', this.error);
      }
    }

    const local = this.local.search(query, limit);
    this.record('local', local.latencyMs);
    return local;
  }

  getAllDocuments(): KnowledgeDoc[] {
    return this.docs;
  }

  async close(): Promise<void> {
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.reinitTimer) clearInterval(this.reinitTimer);
    try {
      await this.client?.close?.();
    } catch {
      /* ignore */
    }
  }

  private parseDoc(d: { payload?: string }): KnowledgeDoc | null {
    if (!d.payload) return null;
    try {
      return JSON.parse(d.payload) as KnowledgeDoc;
    } catch {
      return null;
    }
  }

  private record(backend: 'moss' | 'local', ms: number) {
    const arr = this.samples[backend];
    arr.push(ms);
    if (arr.length > MAX_SAMPLES) arr.shift();
  }
}

function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/** Keep error text useful but never leak credentials. */
function sanitize(err: any): string {
  let msg = String(err?.message ?? err ?? 'unknown error');
  for (const secret of [process.env.MOSS_PROJECT_KEY, process.env.MOSS_PROJECT_ID]) {
    if (secret) msg = msg.split(secret).join('***');
  }
  return msg.slice(0, 300);
}
