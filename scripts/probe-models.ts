/**
 * Finds a Moss embedding path that works for YOUR project.
 *
 *   npx tsx scripts/probe-models.ts --go
 *
 * It creates tiny throwaway indexes named zz-probe-*, tests query + in-process load, then deletes
 * ONLY those probe indexes. It never touches your real indexes. Needs one free index slot.
 * Paste the full output (it contains no keys).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const id = process.env.MOSS_PROJECT_ID?.trim();
const key = process.env.MOSS_PROJECT_KEY?.trim();
if (!id || !key) {
  console.log('MOSS_PROJECT_ID / MOSS_PROJECT_KEY missing.');
  process.exit(1);
}
if (!process.argv.includes('--go')) {
  console.log('This creates and then deletes temporary indexes named zz-probe-*. Re-run with --go to proceed.');
  process.exit(0);
}

const redact = (v: unknown) => {
  let m = String((v as any)?.message ?? v);
  for (const s of [id, key]) if (s) m = m.split(s).join('***');
  return m.slice(0, 350);
};

const mod: any = await import('@moss-dev/moss');
const client = new mod.MossClient(id, key);

// Deterministic pseudo-random unit vectors (no ML model needed) to test the "bring your own embeddings" path.
function vec(seed: number, dim = 384): number[] {
  let x = seed * 9301 + 49297;
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    x = (x * 9301 + 49297) % 233280;
    v.push(x / 233280 - 0.5);
  }
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return v.map((a) => a / n);
}

const texts = [
  'The H100 GPU throttles at 85 degrees Celsius.',
  'Reactive cooling fails because sensors lag behind temperature spikes.',
  'Pre-ramp the fans to 80 percent before a workload burst.',
];

async function attempt(label: string, modelId: string | 'custom') {
  const name = `zz-probe-${modelId.replace(/[^a-z0-9]/gi, '')}-${Date.now().toString(36)}`;
  console.log(`\n=== ${label}  (temporary index: ${name}) ===`);
  const docs =
    modelId === 'custom'
      ? texts.map((t, i) => ({ id: `p${i + 1}`, text: t, embedding: vec(i + 1) }))
      : texts.map((t, i) => ({ id: `p${i + 1}`, text: t }));
  let created = false;
  try {
    const t0 = performance.now();
    await client.createIndex(name, docs, modelId === 'custom' ? undefined : { modelId });
    created = true;
    console.log(`OK   createIndex (${(performance.now() - t0).toFixed(0)} ms)`);

    // 1) cloud query
    try {
      const q0 = performance.now();
      const r =
        modelId === 'custom'
          ? await client.query(name, 'cooling', { topK: 1, embedding: vec(2) })
          : await client.query(name, 'why does reactive cooling fail', { topK: 1 });
      console.log(`OK   cloud query (${(performance.now() - q0).toFixed(0)} ms) top=${r.docs?.[0]?.id}`);
    } catch (e) {
      console.log(`FAIL cloud query: ${redact(e)}`);
    }

    // 2) in-process load + queries
    try {
      const l0 = performance.now();
      await client.loadIndex(name);
      console.log(`OK   loadIndex (${(performance.now() - l0).toFixed(0)} ms)`);
      for (let i = 0; i < 5; i++) {
        const q0 = performance.now();
        const r =
          modelId === 'custom'
            ? await client.query(name, 'cooling', { topK: 1, embedding: vec(2) })
            : await client.query(name, 'why does reactive cooling fail', { topK: 1 });
        console.log(`     in-process query ${i + 1}: ${(performance.now() - q0).toFixed(2)} ms wall, reported ${r.timeTakenInMs} ms, top=${r.docs?.[0]?.id}${modelId === 'custom' ? ' (expected p2)' : ''}`);
      }
      console.log(`RESULT ${label}: IN-PROCESS WORKS`);
    } catch (e) {
      console.log(`FAIL loadIndex: ${redact(e)}`);
      console.log(`RESULT ${label}: in-process does NOT work`);
    }
  } catch (e) {
    console.log(`FAIL createIndex: ${redact(e)}`);
  } finally {
    if (created) {
      try {
        await client.deleteIndex(name);
        console.log(`cleanup: deleted ${name}`);
      } catch (e) {
        console.log(`cleanup FAILED for ${name} (delete it in the dashboard): ${redact(e)}`);
      }
    }
  }
}

let existing: any[] = [];
try {
  existing = await client.listIndexes();
} catch (e) {
  console.log(`Cannot reach Moss: ${redact(e)}`);
  process.exit(1);
}
console.log(`Indexes now: ${existing.length} (${existing.map((i) => i.name).join(', ')})`);
if (existing.length >= 3) {
  console.log('Project is at the 3-index limit. Delete one index in the Moss dashboard first.');
  process.exit(1);
}

await attempt('A) moss-mediumlm model', 'moss-mediumlm');
await attempt('B) bring-your-own embeddings (no Moss model download)', 'custom');

console.log('\nDone. Nothing but zz-probe-* indexes was created or deleted.');
await client.close?.();
process.exit(0);
