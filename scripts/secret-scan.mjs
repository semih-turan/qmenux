#!/usr/bin/env node
// Lightweight pre-commit/CI secret scan. Not a replacement for a dedicated scanner (gitleaks etc.).
// Usage: node scripts/secret-scan.mjs [paths...]   (defaults to the repository root)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.turbo', 'coverage', '.local', 'out', 'playwright-report', 'test-results']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.zip', '.lock']);
const MAX_BYTES = 1_000_000;

const RULES = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['AWS/R2 access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe/PayTR-like live key', /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/],
  ['Anthropic/OpenAI key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  // Postgres URL with an inline password on a non-local host (Neon etc.).
  ['database URL with password', /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{6,}@(?!127\.0\.0\.1|localhost)[^\s/]+/],
  ['card number', /\b(?:4\d{3}|5[1-5]\d{2})[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/],
];

/** `.env` files other than the example must never be scanned-in (they are git-ignored). */
const isRealEnv = (p) => /(^|[\\/])\.env(\.(?!example$)[^\\/]+)?$/.test(p);

function* walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) if (!SKIP_DIRS.has(e)) yield* walk(join(p, e));
  } else if (st.isFile() && st.size <= MAX_BYTES && !SKIP_EXT.has(extname(p).toLowerCase())) {
    yield p;
  }
}

const findings = [];
const roots = process.argv.slice(2);
for (const root of roots.length ? roots : [ROOT]) {
  for (const file of walk(root)) {
    const rel = relative(ROOT, file);
    if (rel === join('scripts', 'secret-scan.mjs')) continue;
    if (isRealEnv(rel)) {
      findings.push(`${rel}: real .env file present in scanned tree (must stay git-ignored)`);
      continue;
    }
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.includes('secret-scan:allow')) return;
      for (const [name, re] of RULES) if (re.test(line)) findings.push(`${rel}:${i + 1}: possible ${name}`);
    });
  }
}

if (findings.length) {
  console.error(`secret-scan: ${findings.length} finding(s)\n` + findings.join('\n'));
  process.exit(1);
}
console.log('secret-scan: clean');
