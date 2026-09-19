/**
 * Moss benchmark/check script
 * Uses the existing MossEngine abstraction to measure real latency
 * Reports which backend serves each query (in-process / cloud / local)
 * Does NOT create or recreate any Moss index
 */

import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

import { MossEngine } from '../server/moss.js';

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

function pct(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function main() {
  const engine = new MossEngine();

  console.log('Initialising MossEngine (loads existing index if available)...');
  await engine.initialize();

  const mode = engine.getSdkMode();
  const isReadyVal = engine.isSdkReady();
  console.log(`\nMoss mode: ${mode}  isSdkReady: ${isReadyVal}`);

  const wallTimes: number[] = [];
  const reportedTimes: number[] = [];
  let sampleResult: string | null = null;

  console.log('\nRunning 60 queries (4 rounds × 15 questions)...\n');

  for (let round = 0; round < 4; round++) {
    for (const q of QUESTIONS) {
      const t0 = process.hrtime.bigint();
      const res = await engine.search(q, 3);
      const wallMs = Number(process.hrtime.bigint() - t0) / 1_000_000;

      wallTimes.push(wallMs);
      reportedTimes.push(res.latencyMs);

      if (round === 0 && !sampleResult) {
        const top = res.results[0]?.document.id ?? '(no match)';
        sampleResult = `"${q}" -> ${top} via ${res.retrievalEngine} (wall: ${wallMs.toFixed(2)}ms, reported: ${res.latencyMs}ms)`;
      }
    }
  }

  const result = {
    when: new Date().toISOString(),
    mossMode: mode,
    isSdkReady: isReadyVal,
    indexName: 'neuralflow-ops-v1',
    docs: engine.getAllDocuments().length,
    queries: wallTimes.length,
    wallClockMs: {
      p50: +pct(wallTimes, 50).toFixed(2),
      p95: +pct(wallTimes, 95).toFixed(2),
      p99: +pct(wallTimes, 99).toFixed(2),
      max: +Math.max(...wallTimes).toFixed(2),
      min: +Math.min(...wallTimes).toFixed(2),
    },
    reportedMs: {
      p50: +pct(reportedTimes, 50).toFixed(2),
      p95: +pct(reportedTimes, 95).toFixed(2),
      p99: +pct(reportedTimes, 99).toFixed(2),
      max: +Math.max(...reportedTimes).toFixed(2),
    },
    sample: sampleResult,
    backendBreakdown: {
      real: mode === 'real' ? wallTimes.length : 0,
      localFallback: mode === 'local-fallback' ? wallTimes.length : 0,
    },
  };

  console.log('Sample:', sampleResult);
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(result, null, 2));

  mkdirSync(join(ROOT, 'bench'), { recursive: true });
  writeFileSync(join(ROOT, 'bench', 'moss-results.json'), JSON.stringify(result, null, 2));
  console.log('\nSaved bench/moss-results.json');

  console.log(`\nBackend: ${mode === 'real' ? 'Moss SDK (in-process)' : 'Local keyword fallback'}`);
  console.log(`Wall-clock p50: ${result.wallClockMs.p50}ms  p95: ${result.wallClockMs.p95}ms  p99: ${result.wallClockMs.p99}ms`);
  console.log(`Reported  p50: ${result.reportedMs.p50}ms  p95: ${result.reportedMs.p95}ms  p99: ${result.reportedMs.p99}ms`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});