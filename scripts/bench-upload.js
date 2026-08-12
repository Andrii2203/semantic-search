'use strict';

// Benchmark the upload pipeline (parse → chunk → embed) under load.
// Usage: node scripts/bench-upload.js [howMany]   (default: all generated)
// Env:   BASE_URL (default http://localhost:3000), BATCH (default 50)
//
// Reports per-batch time, throughput, and the worst /api/health latency during
// upload — a high value means the single-threaded embedding blocked the event
// loop (the signal that decides whether we need an embedding worker_thread).

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const BATCH = parseInt(process.env.BATCH || '50', 10);
const LIMIT = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
const DIR = path.resolve(__dirname, '..', 'test-data', 'resumes');

async function main() {
  if (!fs.existsSync(DIR)) {
    throw new Error(`No resumes at ${DIR}. Run: node scripts/gen-resumes.js [N]`);
  }
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).sort().slice(0, LIMIT);
  if (!files.length) {throw new Error('No PDF files found to upload.');}

  // Fresh bench user
  const email = `bench-${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) {throw new Error(`register failed (${reg.status})`);}
  console.log(`Registered ${email}`);
  console.log(`Uploading ${files.length} files in batches of ${BATCH} → ${BASE}\n`);

  // Probe server responsiveness once per second during the whole run
  let maxPing = 0;
  let pings = 0;
  const probe = setInterval(async () => {
    const p0 = Date.now();
    try { await fetch(`${BASE}/api/health`); } catch {}
    const dt = Date.now() - p0;
    pings++;
    if (dt > maxPing) {maxPing = dt;}
  }, 1000);

  let uploaded = 0;
  const t0 = Date.now();
  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const fd = new FormData();
    for (const f of slice) {
      const buf = fs.readFileSync(path.join(DIR, f));
      fd.append('files', new Blob([buf], { type: 'application/pdf' }), f);
    }
    const b0 = Date.now();
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Cookie: cookie }, body: fd });
    const body = await res.json().catch(() => ({}));
    const dt = Date.now() - b0;
    uploaded += body.processed || 0;
    console.log(`  batch ${Math.floor(i / BATCH) + 1}: ${slice.length} files → processed ${body.processed ?? '?'}, failed ${body.failed ?? '?'}  ${dt}ms (${(dt / slice.length).toFixed(0)}ms/file)`);
  }
  clearInterval(probe);

  const total = Date.now() - t0;
  console.log(`\n── RESULTS ─────────────────────────────`);
  console.log(`Uploaded:    ${uploaded}/${files.length} files`);
  console.log(`Total time:  ${(total / 1000).toFixed(1)}s`);
  console.log(`Throughput:  ${(uploaded / (total / 1000)).toFixed(2)} files/sec`);
  console.log(`Worst /api/health latency during upload: ${maxPing}ms  (>1000ms ⇒ event loop blocked → needs embedding worker)`);
}

main().catch((e) => { console.error('BENCH FAILED:', e.message); process.exit(1); });
