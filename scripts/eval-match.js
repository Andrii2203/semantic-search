'use strict';

// Measure Files-Match QUALITY against a known ground truth.
// Usage: node scripts/eval-match.js
// Pre:   node scripts/gen-resumes.js [N]   (creates resumes + _ground-truth.json)
//
// For each role query, relevant = resumes generated with that role. We compute
// Precision@K, Recall@K, MRR and nDCG@K, averaged across queries.
//
// All search knobs are per-request (no server restart needed) — sweep them via env:
//   THRESHOLD (def 0.3)  MMR_LAMBDA (def 0.5)  MODE (sequential|parallel)
//   USE_HYDE (0|1)  USE_RERANK (0|1)  TOPN (def 20)  K (def 10)
// Example A/B:
//   THRESHOLD=0.3 node scripts/eval-match.js
//   THRESHOLD=0.5 MMR_LAMBDA=1.0 node scripts/eval-match.js

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = path.resolve(__dirname, '..', 'test-data', 'resumes');
const BATCH = parseInt(process.env.BATCH || '50', 10);

const KNOBS = {
  threshold: parseFloat(process.env.THRESHOLD || '0.3'),
  mmrLambda: parseFloat(process.env.MMR_LAMBDA || '0.5'),
  mode: process.env.MODE || 'sequential',
  useHyde: process.env.USE_HYDE === '1',
  useReranker: process.env.USE_RERANK === '1',
  topN: parseInt(process.env.TOPN || '20', 10),
};
const K = parseInt(process.env.K || '10', 10);

// ── Metrics (binary relevance) ──────────────────────────────
function precisionAtK(ranked, relevant, k) {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((r) => relevant.has(r)).length / top.length;
}
function recallAtK(ranked, relevant, k) {
  if (relevant.size === 0) return 0;
  const hit = ranked.slice(0, k).filter((r) => relevant.has(r)).length;
  return hit / relevant.size;
}
function reciprocalRank(ranked, relevant) {
  for (let i = 0; i < ranked.length; i++) if (relevant.has(ranked[i])) return 1 / (i + 1);
  return 0;
}
function ndcgAtK(ranked, relevant, k) {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    if (relevant.has(ranked[i])) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  const ideal = Math.min(relevant.size, k);
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

async function uploadAll(cookie, files) {
  let processed = 0;
  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const fd = new FormData();
    for (const f of slice) {
      const buf = fs.readFileSync(path.join(DIR, f));
      fd.append('files', new Blob([buf], { type: 'application/pdf' }), f);
    }
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Cookie: cookie }, body: fd });
    const body = await res.json().catch(() => ({}));
    processed += body.processed || 0;
  }
  return processed;
}

async function runQuery(cookie, query) {
  const res = await fetch(`${BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ query, collectionId: 'files', ...KNOBS }),
  });
  const body = await res.json().catch(() => ({}));
  // ranked list of fileNames
  return (body.results || []).map((d) => d.item?.metadata?.fileName).filter(Boolean);
}

async function main() {
  const gtPath = path.join(DIR, '_ground-truth.json');
  if (!fs.existsSync(gtPath)) throw new Error(`No ground truth. Run: node scripts/gen-resumes.js [N]`);
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

  // file → role, and role → relevant file set
  const fileRole = new Map(gt.resumes.map((r) => [r.file, r.role]));
  const relevantByRole = new Map();
  for (const r of gt.resumes) {
    if (!relevantByRole.has(r.role)) relevantByRole.set(r.role, new Set());
    relevantByRole.get(r.role).add(r.file);
  }

  const files = gt.resumes.map((r) => r.file);
  const email = `eval-${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error(`register failed (${reg.status})`);

  console.log(`Knobs: ${JSON.stringify(KNOBS)}  K=${K}`);
  console.log(`Uploading ${files.length} resumes…`);
  const processed = await uploadAll(cookie, files);
  console.log(`Indexed ${processed}/${files.length}\n`);

  console.log(`Query (role)                  rel  P@${K}   R@${K}   MRR    nDCG@${K}`);
  console.log('─'.repeat(72));
  const agg = { p: 0, r: 0, mrr: 0, ndcg: 0 };
  let nq = 0;
  for (const { role, query } of gt.queries) {
    const relevant = relevantByRole.get(role);
    if (!relevant || relevant.size === 0) continue;
    const ranked = await runQuery(cookie, query);
    const p = precisionAtK(ranked, relevant, K);
    const rc = recallAtK(ranked, relevant, K);
    const mrr = reciprocalRank(ranked, relevant);
    const ndcg = ndcgAtK(ranked, relevant, K);
    agg.p += p; agg.r += rc; agg.mrr += mrr; agg.ndcg += ndcg; nq++;
    console.log(
      `${role.padEnd(28)} ${String(relevant.size).padStart(3)}  ` +
      `${p.toFixed(2)}   ${rc.toFixed(2)}   ${mrr.toFixed(2)}   ${ndcg.toFixed(2)}`,
    );
  }
  console.log('─'.repeat(72));
  console.log(
    `${'AVERAGE'.padEnd(28)} ${''.padStart(3)}  ` +
    `${(agg.p / nq).toFixed(2)}   ${(agg.r / nq).toFixed(2)}   ${(agg.mrr / nq).toFixed(2)}   ${(agg.ndcg / nq).toFixed(2)}`,
  );
  console.log(`\n(P=precision, R=recall, MRR=first-hit rank, nDCG=rank-weighted. 1.0 = perfect.)`);
}

main().catch((e) => { console.error('EVAL FAILED:', e.message); process.exit(1); });
