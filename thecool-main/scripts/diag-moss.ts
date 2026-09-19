/**
 * Read-only Moss diagnostics: npx tsx scripts/diag-moss.ts
 * Creates, writes and deletes NOTHING. Paste the output (it contains no keys).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { KNOWLEDGE_BASE } from '../server/knowledge.js';

const id = process.env.MOSS_PROJECT_ID?.trim();
const key = process.env.MOSS_PROJECT_KEY?.trim();
const indexName = process.env.MOSS_INDEX_NAME?.trim() || 'neuralflow-kb';

const redact = (v: unknown) => {
  let m = String((v as any)?.message ?? v);
  for (const s of [id, key]) if (s) m = m.split(s).join('***');
  return m.slice(0, 400);
};
const step = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
  const t0 = performance.now();
  try {
    const out = await fn();
    console.log(`OK   ${label}  (${(performance.now() - t0).toFixed(0)} ms)`);
    return out;
  } catch (e) {
    console.log(`FAIL ${label}  (${(performance.now() - t0).toFixed(0)} ms)\n     ${redact(e)}`);
    return undefined;
  }
};

console.log(`credentials present: id=${Boolean(id)} key=${Boolean(key)}   index name: ${indexName}\n`);
if (!id || !key) process.exit(1);

const mod: any = await import('@moss-dev/moss');
const client = new mod.MossClient(id, key);

const indexes: any[] | undefined = await step('listIndexes()', () => client.listIndexes());
if (indexes) {
  console.log(`\nIndexes in this project (${indexes.length}):`);
  for (const i of indexes) {
    console.log(`  - ${i.name}  status=${i.status}  docs=${i.docCount}  model=${i.model?.id ?? i.model?.name ?? JSON.stringify(i.model)}  updated=${i.updatedAt ?? '?'}`);
  }
  console.log(`\nTarget index "${indexName}" exists: ${indexes.some((i) => i.name === indexName)}`);
}

const info: any = await step(`getIndex("${indexName}")`, () => client.getIndex(indexName));
if (info) console.log(`     status=${info.status} docs=${info.docCount} model=${JSON.stringify(info.model)}`);

const docs: any[] | undefined = await step('getDocs (our 24 ids)', () =>
  client.getDocs(indexName, { docIds: KNOWLEDGE_BASE.map((d) => d.id) })
);
if (docs) console.log(`     ${docs.length} of ${KNOWLEDGE_BASE.length} knowledge-base docs are already in the index`);

console.log('');
for (let i = 1; i <= 3; i++) {
  const r: any = await step(`cloud query attempt ${i} (no loadIndex)`, () => client.query(indexName, 'what are the H100 specs', { topK: 2 }));
  if (r) {
    console.log(`     top: ${r.docs?.[0]?.id} score=${r.docs?.[0]?.score}  reported=${r.timeTakenInMs}ms`);
    break;
  }
  await new Promise((res) => setTimeout(res, 1500));
}

const loaded = await step(`loadIndex("${indexName}")  (downloads the embedding model)`, () => client.loadIndex(indexName));
if (loaded !== undefined) {
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const r: any = await client.query(indexName, 'why does reactive cooling fail', { topK: 2 });
    console.log(`     in-process query ${i + 1}: ${(performance.now() - t0).toFixed(2)} ms wall, reported ${r.timeTakenInMs} ms, top=${r.docs?.[0]?.id}`);
  }
}
await client.close?.();
process.exit(0);
