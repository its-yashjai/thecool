/**
 * Local query/document embeddings for Moss "bring your own embeddings" mode.
 *
 * Why: on some projects Moss's own model download (models.moss.link) returns 401 and cloud queries
 * return 503, so loadIndex() cannot start. An index created with our own vectors needs no Moss
 * model at all, and Moss then searches it in-process in about a millisecond.
 *
 * Primary: all-MiniLM-L6-v2 via Transformers.js (real semantic embeddings, 384 dimensions,
 * downloaded once from huggingface.co and cached).
 * Backup:  hashing embedder (no download, purely lexical, clearly labeled as such).
 */
import { KNOWLEDGE_BASE } from './knowledge.js';

export interface Embedder {
  /** Human-readable name, always shown in status output. */
  name: string;
  semantic: boolean;
  dim: number;
  embed(text: string): Promise<number[]>;
}

// ── Backup: feature hashing (lexical, offline) ────────────────────────────────
const DIM = 384;
const STOP = new Set(
  'a an and are as at be but by can do does for from how i if in is it its me my of on or so that the this to was what when where which who why will with you your'.split(' ')
);

function fnv1a(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w));
}

// Inverse document frequency over the knowledge base, so generic words count for less.
let idf: Map<string, number> | null = null;
let idfMax = 1;
function idfWeight(word: string): number {
  if (!idf) {
    idf = new Map();
    const df = new Map<string, number>();
    for (const d of KNOWLEDGE_BASE) {
      const text = [d.title, d.summary, d.content, d.actionableProtocol ?? '', d.keywords.join(' ')].join(' ');
      for (const w of new Set(tokenize(text))) df.set(w, (df.get(w) ?? 0) + 1);
    }
    const n = KNOWLEDGE_BASE.length;
    for (const [w, c] of df) idf.set(w, Math.log(1 + n / c));
    idfMax = Math.log(1 + n);
  }
  return idf.get(word) ?? idfMax; // unseen word: treat as rare
}

export function hashingEmbed(text: string): number[] {
  const words = tokenize(text);
  const feats = new Map<string, number>();
  const add = (f: string, w: number) => feats.set(f, (feats.get(f) ?? 0) + w);
  words.forEach((w, i) => {
    const iw = idfWeight(w);
    add('w:' + w, iw);
    if (w.length > 5) add('s:' + w.slice(0, 5), 0.6 * iw); // crude stem so cooling / cooled / cooler overlap
    if (i > 0) add('b:' + words[i - 1] + '_' + w, 0.5 * Math.min(iw, idfWeight(words[i - 1])));
  });
  const v = new Array<number>(DIM).fill(0);
  for (const [f, w] of feats) {
    const idx = fnv1a(f) % DIM;
    const sign = fnv1a(f, 97) & 1 ? 1 : -1;
    v[idx] += sign * Math.log1p(w);
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

function hashingEmbedder(): Embedder {
  return { name: 'hashing (lexical fallback, not semantic)', semantic: false, dim: DIM, embed: async (t) => hashingEmbed(t) };
}

// ── Primary: MiniLM through Transformers.js ───────────────────────────────────
async function transformersEmbedder(): Promise<Embedder> {
  const modelId = process.env.EMBED_MODEL?.trim() || 'Xenova/all-MiniLM-L6-v2';
  const mod: any = await import('@huggingface/transformers');
  const extractor = await mod.pipeline('feature-extraction', modelId, { dtype: 'q8' });
  const embed = async (text: string): Promise<number[]> => {
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data as Float32Array);
  };
  const probe = await embed('warm up');
  return { name: `${modelId} (local, semantic)`, semantic: true, dim: probe.length, embed };
}

export async function createEmbedder(): Promise<Embedder> {
  // Real semantic embeddings only - fail clearly if the model cannot load.
  // The previous hashing fallback is kept as exported function for diagnostics but never used here.
  try {
    const e = await transformersEmbedder();
    console.log(`[embeddings] using ${e.name}, ${e.dim} dimensions`);
    return e;
  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 400);
    console.error(`[embeddings] FAILED to load semantic model: ${msg}`);
    console.error(`[embeddings] Ensure @huggingface/transformers is installed and huggingface.co is reachable on first run (model files are cached for offline use).`);
    throw new Error(`Semantic embedding model unavailable: ${msg}`);
  }
}
