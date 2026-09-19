/**
 * Local keyword index (FALLBACK retrieval).
 *
 * This is NOT Moss. It is a small in-memory inverted index that keeps the app
 * working when Moss credentials are missing or the Moss service is unreachable.
 * The real retrieval path is server/retrieval.ts, which uses the Moss SDK.
 *
 * Type names (MossDocument, MossSearchResponse, ...) are kept because the
 * front end and the voice dispatcher already use them for both backends.
 */

import { KNOWLEDGE_BASE, KnowledgeDoc } from './knowledge.js';

export type MossDocument = KnowledgeDoc;

export interface MossSearchResult {
  document: MossDocument;
  score: number;
  matchedTerms: string[];
}

export type RetrievalBackend = 'moss' | 'local';

export interface MossSearchResponse {
  query: string;
  results: MossSearchResult[];
  /** Retrieval time in ms as reported by the backend (Moss SDK timeTakenInMs when available). */
  latencyMs: number;
  latencyMicroseconds: number;
  /** Wall-clock time around the call in ms, measured by the server. */
  wallClockMs: number;
  /** Local-embeddings mode only: query embedding time and Moss search time (latencyMs is their sum). */
  embedMs?: number;
  searchMs?: number;
  /** Which backend actually served this query. */
  backend: RetrievalBackend;
  /** in-process (Moss, loaded locally), cloud (Moss over network) or local (keyword fallback). */
  mode: 'in-process' | 'cloud' | 'local';
  /** Human-readable engine label, always truthful about the backend used. */
  retrievalEngine: string;
  /** True when this specific query finished in under 10 ms (measured, not promised). */
  sub10msGuaranteed: boolean;
  totalDocsIndexed: number;
  timestamp: string;
}

export class MossEngine {
  private documents: MossDocument[] = [];
  private invertedIndex: Map<string, Set<number>> = new Map();
  private termFrequency: Map<number, Map<string, number>> = new Map();

  constructor(docs: MossDocument[] = KNOWLEDGE_BASE) {
    this.documents = docs;
    this.buildIndex();
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  private buildIndex() {
    this.invertedIndex.clear();
    this.termFrequency.clear();

    this.documents.forEach((doc, docIdx) => {
      const allText = `${doc.title} ${doc.summary} ${doc.content} ${doc.keywords.join(' ')} ${doc.tags.join(' ')}`;
      const tokens = this.tokenize(allText);

      const freqMap = new Map<string, number>();
      for (const token of tokens) {
        freqMap.set(token, (freqMap.get(token) || 0) + 1);

        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token)!.add(docIdx);
      }

      this.termFrequency.set(docIdx, freqMap);
    });
  }

  /** Keyword search over the in-memory index. */
  public search(query: string, limit = 4): MossSearchResponse {
    const startTime = process.hrtime.bigint();

    const queryTokens = this.tokenize(query);
    const docScores = new Map<number, { score: number; matchedTerms: Set<string> }>();

    for (const token of queryTokens) {
      // Direct matches
      const matchedDocIndices = this.invertedIndex.get(token);
      if (matchedDocIndices) {
        for (const docIdx of matchedDocIndices) {
          const entry = docScores.get(docIdx) || { score: 0, matchedTerms: new Set() };
          const tf = this.termFrequency.get(docIdx)?.get(token) || 1;
          const doc = this.documents[docIdx];

          // Weight title & keywords higher
          let weight = 1.0;
          if (doc.title.toLowerCase().includes(token)) weight += 3.0;
          if (doc.keywords.includes(token)) weight += 2.5;

          entry.score += (1 + Math.log(tf)) * weight;
          entry.matchedTerms.add(token);
          docScores.set(docIdx, entry);
        }
      }

      // Partial / Prefix matches (sub-10ms friendly)
      if (token.length >= 3) {
        for (const [indexedTerm, docSet] of this.invertedIndex.entries()) {
          if (indexedTerm !== token && (indexedTerm.includes(token) || token.includes(indexedTerm))) {
            for (const docIdx of docSet) {
              const entry = docScores.get(docIdx) || { score: 0, matchedTerms: new Set() };
              entry.score += 0.5;
              entry.matchedTerms.add(indexedTerm);
              docScores.set(docIdx, entry);
            }
          }
        }
      }
    }

    // Rank and prepare results
    const rankedResults: MossSearchResult[] = Array.from(docScores.entries())
      .map(([docIdx, { score, matchedTerms }]) => ({
        document: this.documents[docIdx],
        score: Math.round(score * 10) / 10,
        matchedTerms: Array.from(matchedTerms)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const endTime = process.hrtime.bigint();
    const elapsedNano = Number(endTime - startTime);
    const latencyMicroseconds = Math.round(elapsedNano / 1000);
    const latencyMs = Math.round((elapsedNano / 1_000_000) * 100) / 100;

    return {
      query,
      results: rankedResults,
      latencyMs,
      latencyMicroseconds,
      wallClockMs: latencyMs,
      backend: 'local',
      mode: 'local',
      retrievalEngine: 'Local keyword index (fallback, not Moss)',
      sub10msGuaranteed: latencyMs < 10.0,
      totalDocsIndexed: this.documents.length,
      timestamp: new Date().toISOString()
    };
  }

  public getAllDocuments(): MossDocument[] {
    return this.documents;
  }
}
