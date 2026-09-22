/**
 * Benchmark: Moss vs Local on 96-doc KB using 20 paraphrased questions.
 * Compares relevance (Top-1 / Top-3), not raw scores, plus latency.
 * Run: npx tsx scripts/bench-kb.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Retriever } from '../server/retrieval.js';

interface Question {
  id: string;
  query: string;
  category: string;
  expected: string[];
}

async function main() {
  const qPath = path.resolve('bench/questions-20.json');
  const outPath = path.resolve('bench/moss-vs-local-96.json');
  const questions: Question[] = JSON.parse(fs.readFileSync(qPath, 'utf-8'));

  const retriever = new Retriever();
  await retriever.init();
  // Wait for ready or fallback
  let tries = 0;
  while (retriever.status().state === 'initializing' && tries < 10) {
    await new Promise(r => setTimeout(r, 800));
    tries++;
  }
  const st = retriever.status();
  console.log(`\nRetriever: state=${st.state} mode=${st.mode} backend=${st.activeBackend} forced=${(st as any).forcedBackend} docs=${st.docCount} embeddings=${st.embeddings}`);
  if (st.docCount !== 96) console.warn(`WARN: expected 96 docs, got ${st.docCount}`);

  const results: any[] = [];
  let mossTop1 = 0, localTop1 = 0, mossTop3 = 0, localTop3 = 0;
  let mossLatency: number[] = [], localLatency: number[] = [];

  for (const q of questions) {
    // Moss
    retriever.setForcedBackend('moss');
    const moss = await retriever.search(q.query, 3);
    // Local
    retriever.setForcedBackend('local');
    const local = await retriever.search(q.query, 3);
    // reset to auto for next iteration (will be forced again)
    retriever.setForcedBackend('auto');

    const mossTop1Id = moss.results[0]?.document.id || 'none';
    const localTop1Id = local.results[0]?.document.id || 'none';
    const mossTop3Ids = moss.results.slice(0,3).map(r=>r.document.id);
    const localTop3Ids = local.results.slice(0,3).map(r=>r.document.id);

    const mossTop1Rel = q.expected.includes(mossTop1Id) ? 'YES' : 'NO';
    const localTop1Rel = q.expected.includes(localTop1Id) ? 'YES' : 'NO';
    const mossTop3Rel = mossTop3Ids.some(id=> q.expected.includes(id)) ? 'YES' : 'NO';
    const localTop3Rel = localTop3Ids.some(id=> q.expected.includes(id)) ? 'YES' : 'NO';
    // Partial if expected keywords overlap but not exact id? We keep binary for now, mark PARTIAL if score low
    if (mossTop1Rel==='YES') mossTop1++;
    if (localTop1Rel==='YES') localTop1++;
    if (mossTop3Rel==='YES') mossTop3++;
    if (localTop3Rel==='YES') localTop3++;

    mossLatency.push(moss.latencyMs);
    localLatency.push(local.latencyMs);

    const entry = {
      id: q.id,
      query: q.query,
      category: q.category,
      expected: q.expected,
      MOSS: {
        top1: mossTop1Id,
        top3: mossTop3Ids,
        top1Relevant: mossTop1Rel,
        top3Relevant: mossTop3Rel,
        latencyMs: moss.latencyMs,
        backend: moss.backend,
        mode: moss.mode,
        score: moss.results[0]?.score ?? null,
      },
      LOCAL: {
        top1: localTop1Id,
        top3: localTop3Ids,
        top1Relevant: localTop1Rel,
        top3Relevant: localTop3Rel,
        latencyMs: local.latencyMs,
        backend: local.backend,
        mode: local.mode,
        score: local.results[0]?.score ?? null,
      }
    };
    results.push(entry);

    // Print per-question as requested format
    console.log(`\n${q.id} "${q.query}"`);
    console.log(`MOSS  Top-1: ${mossTop1Id} Relevant:${mossTop1Rel} Top-3:${mossTop3Rel} Latency:${moss.latencyMs}ms  Top3:[${mossTop3Ids.join(', ')}]`);
    console.log(`LOCAL Top-1: ${localTop1Id} Relevant:${localTop1Rel} Top-3:${localTop3Rel} Latency:${local.latencyMs}ms  Top3:[${localTop3Ids.join(', ')}]`);
  }

  const avg = (arr:number[]) => arr.reduce((a,b)=>a+b,0)/arr.length;
  const p50 = (arr:number[]) => { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
  const p95 = (arr:number[]) => { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length*0.95)]; };

  const summary = {
    when: new Date().toISOString(),
    retriever: retriever.status(),
    totalQuestions: questions.length,
    moss: { top1: mossTop1, top1Pct: +(mossTop1/questions.length*100).toFixed(1), top3: mossTop3, top3Pct: +(mossTop3/questions.length*100).toFixed(1), p50: +p50(mossLatency).toFixed(2), p95: +p95(mossLatency).toFixed(2), avg: +avg(mossLatency).toFixed(2) },
    local: { top1: localTop1, top1Pct: +(localTop1/questions.length*100).toFixed(1), top3: localTop3, top3Pct: +(localTop3/questions.length*100).toFixed(1), p50: +p50(localLatency).toFixed(2), p95: +p95(localLatency).toFixed(2), avg: +avg(localLatency).toFixed(2) },
    note: "Relevance = expected id in Top-1/Top-3. Scores not compared across backends (different scales).",
    results
  };

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Docs: ${st.docCount}  Questions: ${questions.length}`);
  console.log(`MOSS  Top-1: ${mossTop1}/${questions.length} (${summary.moss.top1Pct}%) Top-3: ${mossTop3}/${questions.length} (${summary.moss.top3Pct}%)  p50:${summary.moss.p50}ms p95:${summary.moss.p95}ms avg:${summary.moss.avg}ms`);
  console.log(`LOCAL Top-1: ${localTop1}/${questions.length} (${summary.local.top1Pct}%) Top-3: ${localTop3}/${questions.length} (${summary.local.top3Pct}%)  p50:${summary.local.p50}ms p95:${summary.local.p95}ms avg:${summary.local.avg}ms`);
  console.log(`\nStatement: With the same 96-document knowledge base and the same Gemini model, we compared Moss semantic retrieval against the local keyword fallback using 20 paraphrased operator queries.`);

  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nSaved ${outPath}`);

  await retriever.close();
}

main().catch(e=>{ console.error(e); process.exit(1); });
