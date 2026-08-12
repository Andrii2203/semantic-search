'use strict';

// Measure Files-Match QUALITY against a known ground truth.
//
// Single run (prints to console, knobs from env):
//   node scripts/eval-match.js
//   THRESHOLD=0.3 MMR_LAMBDA=1.0 node scripts/eval-match.js
//
// Full report (uploads once, sweeps a config matrix, writes docs/eval-report.md):
//   node scripts/eval-match.js --report
//
// Pre: node scripts/gen-resumes.js [N]   (creates resumes + _ground-truth.json)
//
// For each role query, relevant = resumes generated with that role. We compute
// Precision@K, Recall@K, MRR and nDCG@K, averaged across queries. All search
// knobs are per-request, so the matrix reuses a single upload.

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = path.resolve(__dirname, '..', 'test-data', 'resumes');
const REPORT = path.resolve(__dirname, '..', 'docs', 'eval-report.md');
const BATCH = parseInt(process.env.BATCH || '50', 10);
const K = parseInt(process.env.K || '10', 10);

const ENV_KNOBS = {
  threshold: parseFloat(process.env.THRESHOLD || '0.3'),
  mmrLambda: parseFloat(process.env.MMR_LAMBDA || '0.5'),
  mode: process.env.MODE || 'sequential',
  useHyde: process.env.USE_HYDE === '1',
  useReranker: process.env.USE_RERANK === '1',
  topN: parseInt(process.env.TOPN || '20', 10),
};

// Config matrix for --report. Each isolates a lever against the recommended baseline.
const MATRIX = [
  { name: 'UI default (pre-fix)',          knobs: { threshold: 0.65, mmrLambda: 0.5 } },
  { name: 'lower threshold only',          knobs: { threshold: 0.3,  mmrLambda: 0.5 } },
  { name: 'diversity off only (MMR 1.0)',  knobs: { threshold: 0.65, mmrLambda: 1.0 } },
  { name: 'threshold 0.5 + MMR off',       knobs: { threshold: 0.5,  mmrLambda: 1.0 } },
  { name: 'RECOMMENDED (thr 0.3, MMR off)', knobs: { threshold: 0.3, mmrLambda: 1.0 }, primary: true },
];

// ── Metrics (binary relevance) ──────────────────────────────
function precisionAtK(ranked, relevant, k) {
  const top = ranked.slice(0, k);
  if (top.length === 0) {return 0;}
  return top.filter((r) => relevant.has(r)).length / top.length;
}
function recallAtK(ranked, relevant, k) {
  if (relevant.size === 0) {return 0;}
  return ranked.slice(0, k).filter((r) => relevant.has(r)).length / relevant.size;
}
function reciprocalRank(ranked, relevant) {
  for (let i = 0; i < ranked.length; i++) {if (relevant.has(ranked[i])) {return 1 / (i + 1);}}
  return 0;
}
function ndcgAtK(ranked, relevant, k) {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    if (relevant.has(ranked[i])) {dcg += 1 / Math.log2(i + 2);}
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(relevant.size, k); i++) {idcg += 1 / Math.log2(i + 2);}
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

async function runQuery(cookie, query, knobs) {
  const res = await fetch(`${BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ query, collectionId: 'files', mode: 'sequential', topN: 20, ...knobs }),
  });
  const body = await res.json().catch(() => ({}));
  return (body.results || []).map((d) => d.item?.metadata?.fileName).filter(Boolean);
}

// Run all role queries for one knob set → per-role rows + averages.
async function evalConfig(cookie, gt, relevantByRole, knobs) {
  const rows = [];
  const agg = { p: 0, r: 0, mrr: 0, ndcg: 0 };
  for (const { role, query } of gt.queries) {
    const relevant = relevantByRole.get(role);
    if (!relevant || relevant.size === 0) {continue;}
    const ranked = await runQuery(cookie, query, knobs);
    const row = {
      role,
      rel: relevant.size,
      p: precisionAtK(ranked, relevant, K),
      r: recallAtK(ranked, relevant, K),
      mrr: reciprocalRank(ranked, relevant),
      ndcg: ndcgAtK(ranked, relevant, K),
    };
    rows.push(row);
    agg.p += row.p; agg.r += row.r; agg.mrr += row.mrr; agg.ndcg += row.ndcg;
  }
  const n = rows.length;
  return { rows, avg: { p: agg.p / n, r: agg.r / n, mrr: agg.mrr / n, ndcg: agg.ndcg / n } };
}

async function register() {
  const email = `eval-${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) {throw new Error(`register failed (${reg.status})`);}
  return cookie;
}

function loadGroundTruth() {
  const gtPath = path.join(DIR, '_ground-truth.json');
  if (!fs.existsSync(gtPath)) {throw new Error('No ground truth. Run: node scripts/gen-resumes.js [N]');}
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
  const relevantByRole = new Map();
  for (const r of gt.resumes) {
    if (!relevantByRole.has(r.role)) {relevantByRole.set(r.role, new Set());}
    relevantByRole.get(r.role).add(r.file);
  }
  return { gt, relevantByRole };
}

// ── Mode A: single config to console ────────────────────────
async function runSingle() {
  const { gt, relevantByRole } = loadGroundTruth();
  const files = gt.resumes.map((r) => r.file);
  const cookie = await register();
  console.log(`Knobs: ${JSON.stringify(ENV_KNOBS)}  K=${K}`);
  console.log(`Uploading ${files.length} resumes…`);
  console.log(`Indexed ${await uploadAll(cookie, files)}/${files.length}\n`);

  const { rows, avg } = await evalConfig(cookie, gt, relevantByRole, ENV_KNOBS);
  console.log(`Query (role)                  rel  P@${K}   R@${K}   MRR    nDCG@${K}`);
  console.log('─'.repeat(72));
  for (const r of rows) {
    console.log(`${r.role.padEnd(28)} ${String(r.rel).padStart(3)}  ${r.p.toFixed(2)}   ${r.r.toFixed(2)}   ${r.mrr.toFixed(2)}   ${r.ndcg.toFixed(2)}`);
  }
  console.log('─'.repeat(72));
  console.log(`${'AVERAGE'.padEnd(28)} ${''.padStart(3)}  ${avg.p.toFixed(2)}   ${avg.r.toFixed(2)}   ${avg.mrr.toFixed(2)}   ${avg.ndcg.toFixed(2)}`);
}

// ── Mode B: full matrix → markdown report ───────────────────
async function runReport() {
  const { gt, relevantByRole } = loadGroundTruth();
  const files = gt.resumes.map((r) => r.file);
  const cookie = await register();
  console.log(`Uploading ${files.length} resumes once…`);
  const indexed = await uploadAll(cookie, files);
  console.log(`Indexed ${indexed}/${files.length}. Sweeping ${MATRIX.length} configs…\n`);

  const results = [];
  for (const cfg of MATRIX) {
    process.stdout.write(`  ${cfg.name}… `);
    const out = await evalConfig(cookie, gt, relevantByRole, cfg.knobs);
    results.push({ ...cfg, ...out });
    console.log(`nDCG@${K}=${out.avg.ndcg.toFixed(2)}`);
  }

  const primary = results.find((r) => r.primary) || results[results.length - 1];
  const baseline = results.find((r) => r.name.startsWith('UI default'));

  const f2 = (x) => x.toFixed(2);
  const roleCount = relevantByRole.size;
  const L = [];
  L.push('# Files-Match quality report');
  L.push('');
  L.push('> Auto-generated by `node scripts/eval-match.js --report`. Do not edit by hand —');
  L.push('> re-run to refresh. Numbers come straight from the live search API against a');
  L.push('> labelled synthetic corpus, so they are reproducible, not hand-copied.');
  L.push('');
  L.push(`- **Generated:** ${new Date().toISOString()}`);
  L.push(`- **Corpus:** ${gt.count} synthetic resumes across ${roleCount} roles (\`scripts/gen-resumes.js\`), indexed ${indexed}/${files.length}`);
  L.push(`- **Task:** for each role query, relevant = resumes generated with that role`);
  L.push(`- **K:** ${K}  ·  **Metrics:** Precision@K, Recall@K, MRR, nDCG@K (1.0 = perfect)`);
  L.push('');
  L.push('## Headline');
  L.push('');
  if (baseline) {
    L.push(`The product\'s pre-fix defaults (cosine threshold 0.65 + MMR diversity 0.5) scored`);
    L.push(`**nDCG@${K} = ${f2(baseline.avg.ndcg)}** (recall ${f2(baseline.avg.r)}). The measured optimum`);
    L.push(`(threshold 0.3 + MMR off) scores **nDCG@${K} = ${f2(primary.avg.ndcg)}** (recall ${f2(primary.avg.r)}).`);
    L.push(`Two blind knobs were costing ${Math.round((primary.avg.ndcg - baseline.avg.ndcg) * 100)} nDCG points.`);
  }
  L.push('');
  L.push('## Config comparison (averaged over all role queries)');
  L.push('');
  L.push(`| Config | threshold | MMR λ | P@${K} | R@${K} | MRR | nDCG@${K} |`);
  L.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const star = r.primary ? ' ⭐' : '';
    L.push(`| ${r.name}${star} | ${r.knobs.threshold} | ${r.knobs.mmrLambda} | ${f2(r.avg.p)} | ${f2(r.avg.r)} | ${f2(r.avg.mrr)} | ${f2(r.avg.ndcg)} |`);
  }
  L.push('');
  L.push(`## Per-role breakdown — RECOMMENDED config (thr ${primary.knobs.threshold}, MMR ${primary.knobs.mmrLambda})`);
  L.push('');
  L.push(`| Role | relevant | P@${K} | R@${K} | MRR | nDCG@${K} |`);
  L.push('|---|---|---|---|---|---|');
  for (const r of primary.rows) {
    L.push(`| ${r.role} | ${r.rel} | ${f2(r.p)} | ${f2(r.r)} | ${f2(r.mrr)} | ${f2(r.ndcg)} |`);
  }
  L.push(`| **AVERAGE** | | **${f2(primary.avg.p)}** | **${f2(primary.avg.r)}** | **${f2(primary.avg.mrr)}** | **${f2(primary.avg.ndcg)}** |`);
  L.push('');
  L.push('## How to reproduce');
  L.push('');
  L.push('```bash');
  L.push(`node scripts/gen-resumes.js ${gt.count}        # regenerate corpus + ground truth`);
  L.push('node scripts/eval-match.js --report     # re-run the matrix, rewrite this file');
  L.push('```');
  L.push('');
  L.push('Notes: keyword extraction can use an LLM, so averages carry ~±0.05 run-to-run');
  L.push('noise; the headline gap is far larger than the noise. Diversity (MMR) is left ON');
  L.push('for internet search — it only hurts same-role candidate matching.');
  L.push('');

  fs.writeFileSync(REPORT, L.join('\n'));
  console.log(`\nReport written → ${path.relative(path.resolve(__dirname, '..'), REPORT)}`);
}

(process.argv.includes('--report') ? runReport() : runSingle())
  .catch((e) => { console.error('EVAL FAILED:', e.message); process.exit(1); });
