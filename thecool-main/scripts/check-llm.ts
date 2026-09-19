/**
 * npm run check:llm : one test call to your LLM so you know the model name and key work.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { askLlm, llmStatus } from '../server/llm.js';
import { Retriever } from '../server/retrieval.js';

const st = llmStatus();
console.log('LLM status:', st);
if (!st.configured) {
  console.log('\nLLM is off. Fix the reason above (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL), or ignore it: the app works without it.');
  process.exit(1);
}

const r = new Retriever();
const moss = await r.search('what does RB-04 say about the 85 degree limit', 3);
try {
  const out = await askLlm(
    'What does RB-04 say about the 85 degree limit?',
    { junctionC: 61.2, fanPct: 45, powerW: 420, forecastWorstC: 66.8, running: true },
    moss
  );
  console.log(`\nOK (${out.ms} ms, model ${out.model}):\n${out.text}`);
} catch (e: any) {
  console.error('\nLLM call FAILED:', e?.message ?? e);
  console.error('Most common causes: wrong LLM_MODEL name for this provider, invalid key, or wrong LLM_BASE_URL.');
  process.exit(1);
}
process.exit(0);
