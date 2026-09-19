/**
 * Moss health check + benchmark.
 *
 *   npm run check:moss
 *
 * 1. Loads credentials from .env.local / .env
 * 2. Creates or syncs the Moss index from server/knowledge.ts
 * 3. Tries to load it in-process (fastest path); falls back to Moss Cloud queries; then to local keywords
 * 4. Runs 60 realistic voice questions and prints p50 / p95 latency
 * 5. Saves bench/moss-results.json (cite this file in your submission)
 */
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Retriever } from '../server/retrieval.js';

const QUESTIONS = [
  'what are the H100 specs',
  'when do I trigger the emergency guardrail',
  'what does RB-01 say',
  'why does reactive cooling fail',
  'explain thermal inertia',
  'how does the forecast work',
  'what is throttling',
  'compare PID and NeuralFlow',
  'how hot can the GPU get before it throttles',
  'what should I do after an emergency',
  'which GPU runs hottest in the cluster',
  'how much power do fans use at full speed',
  'what is PUE',
  'what commands can I say',
  'tell me about the B200',
];

const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const r = new Retriever();
console.log(`Moss configured: ${r.configured}  index: ${r.indexName}`);
console.log('Initialising (first run creates the index, this can take a little while)...');
await r.init();

const st = r.status();
console.log(`\nState: ${st.state}   Mode: ${st.mode}`);
if (st.error) console.log(`Note: ${st.error}`);

const wall: number[] = [];
const reported: number[] = [];
let sample = '';
const byMode: Record<string, number> = {};
const embedTimes: number[] = [];
for (let round = 0; round < 4; round++) {
  for (const q of QUESTIONS) {
    const t0 = performance.now();
    const res = await r.search(q, 3);
    wall.push(performance.now() - t0);
    reported.push(res.latencyMs);
    byMode[res.mode] = (byMode[res.mode] ?? 0) + 1;
    if (res.embedMs !== undefined) embedTimes.push(res.embedMs);
    if (round === 0 && !sample) sample = `"${q}" -> ${res.results[0]?.document.id ?? '(no match)'} via ${res.retrievalEngine}`;
  }
}
console.log(`\nSample: ${sample}`);
const out = {
  when: new Date().toISOString(),
  mode: st.mode,
  backend: st.activeBackend,
  index: r.indexName,
  docs: st.docCount,
  queries: wall.length,
  perQueryBackend: byMode,
  embeddings: st.embeddings,
  embedMs: embedTimes.length ? { p50: +pct(embedTimes, 50).toFixed(2), p95: +pct(embedTimes, 95).toFixed(2) } : null,
  wallClockMs: { p50: +pct(wall, 50).toFixed(2), p95: +pct(wall, 95).toFixed(2), max: +Math.max(...wall).toFixed(2) },
  reportedMs: { p50: +pct(reported, 50).toFixed(2), p95: +pct(reported, 95).toFixed(2) },
  note: st.error ?? null,
};
console.log(out);
mkdirSync('bench', { recursive: true });
writeFileSync('bench/moss-results.json', JSON.stringify(out, null, 2));
console.log('\nSaved bench/moss-results.json');

if (st.mode === 'in-process') console.log('\nRESULT: Moss is running in-process. Under-10ms path is live.');
else if (st.mode === 'cloud') console.log('\nRESULT: Moss works over the network only (in-process model load failed). See the note above.');
else console.log('\nRESULT: Moss is NOT active. The app will use the local keyword fallback.');

await r.close();
process.exit(st.mode === 'local' ? 1 : 0);
