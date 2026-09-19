import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { Retriever } from '../server/retrieval.js';

const Q: [string, string[]][] = [
 ['what are the H100 specs',['HW-H100-SXM5']],
 ['when do I trigger the emergency guardrail',['RB-04-EMERGENCY-TRIP','GD-THRESHOLDS']],
 ['what does RB-01 say',['RB-01-BURST','RB-01-TRIGGER']],
 ['why does reactive cooling fail',['INC-LESSONS','INC-2026-08','REF-PID-VS-NF']],
 ['explain thermal inertia',['REF-THERMAL-INERTIA']],
 ['how does the forecast work',['REF-FORECAST']],
 ['what is throttling',['REF-THROTTLING']],
 ['compare PID and NeuralFlow',['REF-PID-VS-NF','RB-02-PID-OSCILLATION']],
 ['how hot can the GPU get before it throttles',['GD-THRESHOLDS','HW-H100-SXM5','REF-THROTTLING']],
 ['what should I do after an emergency',['RB-05-RECOVERY']],
 ['which GPU runs hottest in the cluster',['HW-CLUSTER-3X3']],
 ['how much power do fans use at full speed',['REF-FAN-POWER']],
 ['what is PUE',['REF-PUE']],
 ['what commands can I say',['REF-VOICE-HOWTO']],
 ['tell me about the B200',['HW-B200-NVL']],
];

const r = new Retriever();
console.log(`Moss configured: ${r.configured} index: ${r.indexName}`);
const tInit0 = performance.now();
await r.init();
const tInit = performance.now() - tInit0;
console.log(`Init time: ${tInit.toFixed(0)}ms`);
console.log(r.status());

let top1=0, top3=0;
for (const [q, exp] of Q) {
  const t0 = performance.now();
  const res = await r.search(q, 3);
  const t = performance.now() - t0;
  const ids = res.results.map(x=>x.document.id);
  const ok1 = exp.includes(ids[0]);
  const ok3 = ids.slice(0,3).some(id=>exp.includes(id));
  top1+= ok1?1:0;
  top3+= ok3?1:0;
  const mark = ok1?'✓': ok3?'~':'✗';
  console.log(`${mark} "${q}" -> ${ids.join(', ')} via ${res.retrievalEngine} ${res.latencyMs}ms (wall ${res.wallClockMs}ms embed ${res.embedMs}ms search ${res.searchMs}ms)`);
}
console.log(`\nSemantic top1 ${top1}/${Q.length} top3 ${top3}/${Q.length}`);
console.log(`Init: ${tInit.toFixed(0)}ms (one-time model load + index load)`);
await r.close();
