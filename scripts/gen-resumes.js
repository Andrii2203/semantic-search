'use strict';

// Generate N realistic, full-page synthetic resume PDFs + a ground-truth file.
// Usage: node scripts/gen-resumes.js [N]   (default 60)
// Output: test-data/resumes/resume_0001.pdf ...  +  _ground-truth.json
//
// Each resume is assigned a ROLE with signature skills. The ground-truth file
// records, per resume, its role + skills — so eval-match.js can compute
// Precision@K / MRR / nDCG automatically (relevant = resumes of the queried role).

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const N = parseInt(process.argv[2] || '60', 10);
const OUT = path.resolve(__dirname, '..', 'test-data', 'resumes');
fs.mkdirSync(OUT, { recursive: true });

// ── Pools ───────────────────────────────────────────────────
const FIRST = ['Alex', 'Maria', 'John', 'Olena', 'Dmitri', 'Sara', 'Ivan', 'Nina', 'Pavel', 'Kateryna', 'Tom', 'Yuki', 'Omar', 'Lena', 'Marco', 'Anna', 'Sven', 'Priya', 'Diego', 'Mei'];
const LAST = ['Smith', 'Kovalenko', 'Lee', 'Novak', 'Petrov', 'Garcia', 'Mueller', 'Tanaka', 'Hassan', 'Rossi', 'Kim', 'Brown', 'Shevchenko', 'Patel', 'Nguyen', 'Ivanov', 'Andersson', 'Silva', 'Khan', 'Wong'];
const CITIES = ['Warsaw, Poland', 'Berlin, Germany', 'Lisbon, Portugal', 'Kyiv, Ukraine', 'Amsterdam, NL', 'Tallinn, Estonia', 'Remote (EU)', 'Krakow, Poland'];
const COMPANIES = ['Acme', 'Globex', 'Initech', 'Northwind', 'Hooli', 'Contoso', 'Umbrella', 'Vandelay', 'Soylent', 'Stark Labs', 'Wayne Tech', 'Cyberdyne'];
const UNIS = ['Warsaw University of Technology', 'TU Berlin', 'KPI Kyiv', 'University of Lisbon', 'TU Delft', 'Jagiellonian University'];
const DEGREES = ['BSc Computer Science', 'MSc Software Engineering', 'BEng Information Systems', 'MSc Data Science'];

// role → signature skills + a natural-language search query that targets it.
const ROLE_PROFILES = {
  'Backend Engineer': {
    skills: ['Go', 'PostgreSQL', 'gRPC', 'Redis', 'microservices', 'Kafka'],
    query: 'backend engineer building high-throughput Go microservices with PostgreSQL, gRPC and Kafka',
  },
  'Frontend Developer': {
    skills: ['React', 'TypeScript', 'Next.js', 'Redux', 'CSS', 'web accessibility'],
    query: 'frontend developer with deep React and TypeScript experience building accessible, fast UIs',
  },
  'DevOps Engineer': {
    skills: ['Kubernetes', 'Terraform', 'AWS', 'Docker', 'CI/CD pipelines', 'Prometheus'],
    query: 'DevOps engineer who runs Kubernetes on AWS and automates infrastructure with Terraform',
  },
  'Data Scientist': {
    skills: ['Python', 'pandas', 'scikit-learn', 'statistics', 'SQL', 'A/B experimentation'],
    query: 'data scientist strong in Python, statistics and A/B experimentation',
  },
  'ML Engineer': {
    skills: ['PyTorch', 'TensorFlow', 'CUDA', 'MLOps', 'transformers', 'model serving'],
    query: 'machine learning engineer training deep models in PyTorch and serving transformers at scale',
  },
  'Mobile Developer': {
    skills: ['Swift', 'Kotlin', 'iOS', 'Android', 'React Native', 'mobile UX'],
    query: 'mobile developer shipping native iOS (Swift) and Android (Kotlin) applications',
  },
  'Security Engineer': {
    skills: ['penetration testing', 'threat modeling', 'cryptography', 'SIEM', 'incident response', 'OWASP'],
    query: 'security engineer focused on threat modeling, penetration testing and incident response',
  },
  'Full-Stack Developer': {
    skills: ['Node.js', 'React', 'TypeScript', 'PostgreSQL', 'Docker', 'REST APIs'],
    query: 'full-stack developer comfortable across Node.js backends and React frontends',
  },
};
const ROLES = Object.keys(ROLE_PROFILES);

const NOISE_SKILLS = ['Git', 'Agile/Scrum', 'Linux', 'GraphQL', 'Jest', 'observability', 'system design', 'code review'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);}
  return out;
}
function randint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// Experience bullet templates — {s} interpolated with a signature skill.
const BULLETS = [
  'Designed and shipped production services using {s}, cutting p99 latency by {p}%.',
  'Owned the {s} stack end to end, from design to on-call.',
  'Led migration to {s}, improving reliability and reducing incidents by {p}%.',
  'Built automated test and deploy pipelines around {s}.',
  'Mentored {n} engineers on {s} best practices and code review.',
  'Scaled the platform to {k}M requests/day with {s}.',
];

// ── Page writer with wrapping + page breaks ─────────────────
function makeWriter(doc, font, bold) {
  const PAGE = [595, 842];
  const MARGIN = 50;
  const MAXW = PAGE[0] - MARGIN * 2;
  let page = doc.addPage(PAGE);
  let y = PAGE[1] - MARGIN;

  function ensure(space) {
    if (y - space < MARGIN) { page = doc.addPage(PAGE); y = PAGE[1] - MARGIN; }
  }
  function wrap(text, f, size) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(trial, size) > MAXW && cur) { lines.push(cur); cur = w; }
      else {cur = trial;}
    }
    if (cur) {lines.push(cur);}
    return lines;
  }
  function line(text, { size = 9.5, b = false, gap = 3, color } = {}) {
    const f = b ? bold : font;
    for (const ln of wrap(text, f, size)) {
      ensure(size + gap);
      page.drawText(ln, { x: MARGIN, y, size, font: f, color: color || rgb(0.1, 0.1, 0.12) });
      y -= size + gap;
    }
  }
  function heading(text) {
    y -= 6; ensure(16);
    page.drawText(text.toUpperCase(), { x: MARGIN, y, size: 11, font: bold, color: rgb(0.15, 0.3, 0.55) });
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE[0] - MARGIN, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) });
    y -= 8;
  }
  function space(h = 4) { y -= h; }
  return { line, heading, space };
}

async function genOne(i) {
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const role = ROLES[i % ROLES.length]; // even distribution across roles
  const prof = ROLE_PROFILES[role];
  const years = randint(3, 14);
  const city = pick(CITIES);
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
  const sig = prof.skills;
  const noise = pickN(NOISE_SKILLS, randint(2, 4));
  const allSkills = [...sig, ...noise];

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = makeWriter(doc, font, bold);

  // Header
  w.line(name, { size: 20, b: true, gap: 4 });
  w.line(`${role} · ${years} years of experience`, { size: 11, gap: 3 });
  w.line(`${city} · ${email} · +48 ${randint(500, 899)} ${randint(100, 999)} ${randint(100, 999)}`, { size: 9, gap: 2, color: rgb(0.4, 0.4, 0.45) });

  // Summary
  w.heading('Summary');
  w.line(`${role} with ${years} years of experience, specialising in ${sig.slice(0, 3).join(', ')}. Track record of shipping production systems and leading engineering work end to end.`);

  // Experience
  w.heading('Experience');
  for (let e = 0; e < randint(2, 3); e++) {
    const company = pick(COMPANIES);
    const start = 2026 - randint(1, years);
    const end = e === 0 ? 'present' : String(start + randint(1, 3));
    w.line(`${role} · ${company} · ${start} – ${end} · ${pick(CITIES)}`, { size: 9.5, b: true });
    for (let b = 0; b < randint(3, 4); b++) {
      const t = pick(BULLETS)
        .replace('{s}', pick(sig))
        .replace('{p}', String(randint(15, 60)))
        .replace('{n}', String(randint(2, 6)))
        .replace('{k}', String(randint(1, 40)));
      w.line(`•  ${t}`, { size: 9, gap: 2.5 });
    }
    w.line(`Stack: ${pickN(allSkills, randint(3, 5)).join(', ')}`, { size: 8.5, gap: 4, color: rgb(0.3, 0.45, 0.65) });
  }

  // Projects
  w.heading('Projects');
  w.line(`${pick(['Internal Platform', 'Analytics Engine', 'Data Pipeline', 'Developer Portal'])}`, { size: 9.5, b: true });
  w.line(`•  Built with ${pickN(sig, 2).join(' and ')}; ${pick(['open-sourced', 'adopted org-wide', 'reduced costs', 'sped up delivery'])}.`, { size: 9, gap: 4 });

  // Skills
  w.heading('Skills');
  w.line(`Core: ${sig.join(', ')}`, { size: 9 });
  w.line(`Also: ${noise.join(', ')}`, { size: 9 });

  // Education + languages
  w.heading('Education');
  w.line(`${pick(DEGREES)} — ${pick(UNIS)} · ${2026 - years - randint(0, 3)}`, { size: 9 });
  w.heading('Languages');
  w.line(`English — ${pick(['C1', 'C2', 'B2'])}${Math.random() > 0.5 ? ' · Ukrainian — Native' : ''}${Math.random() > 0.6 ? ' · Polish — B2' : ''}`, { size: 9 });

  const file = `resume_${String(i).padStart(4, '0')}.pdf`;
  fs.writeFileSync(path.join(OUT, file), await doc.save());
  return { file, name, role, skills: allSkills };
}

(async () => {
  const start = Date.now();
  const truth = [];
  for (let i = 1; i <= N; i++) {
    truth.push(await genOne(i));
    if (i % 20 === 0) {console.log(`  generated ${i}/${N}`);}
  }
  // Ground truth: per-resume labels + the eval queries (one per role).
  const queries = Object.entries(ROLE_PROFILES).map(([role, p]) => ({ role, query: p.query }));
  fs.writeFileSync(
    path.join(OUT, '_ground-truth.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), count: N, resumes: truth, queries }, null, 2),
  );
  console.log(`\nGenerated ${N} resume PDFs + _ground-truth.json in ${OUT} (${Date.now() - start}ms)`);
})();
