// Read-only checks against your OWN deployed site. No account, password, or secret is needed.
import http from 'node:http';
import https from 'node:https';

const usage = 'Usage: npm run verify:deployment -- https://YOUR_REAL_DOMAIN';
const input = process.argv.slice(2);
if (input.length === 1 && input[0] === '--help') {
  console.log(usage);
  console.log('Checks redirects, verified TLS, security headers, health, and protected routes.');
  process.exit(0);
}
let origin;
try {
  const url = new URL(input[0]);
  if (
    input.length !== 1 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.port
  )
    throw new Error();
  origin = url.origin;
} catch {
  console.error(usage);
  console.error(
    'Supply the canonical HTTPS origin, without credentials, a port, a path, or a query.',
  );
  process.exit(2);
}

// Do not follow redirects automatically: otherwise an HTTP downgrade or wrong host can be missed.
// Explicit certificate verification is retained even if the shell has an insecure TLS default.
function get(url) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(
      url,
      {
        agent: false,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        headers: { 'User-Agent': 'U-Stay-Fit-Deployment-Check/1.0', 'Accept-Encoding': 'identity' },
      },
      (res) => {
        const tls =
          url.protocol === 'https:'
            ? {
                authorized: res.socket.authorized,
                protocol: res.socket.getProtocol(),
                expires: res.socket.getPeerCertificate().valid_to,
              }
            : null;
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 512 * 1024)
            req.destroy(new Error('Response exceeds the 512 KiB check limit.'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
            tls,
          }),
        );
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error('Request timed out after 15 seconds.')),
      15000,
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}
let failed = 0;
function check(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) failed++;
}
function headers(response, path) {
  const h = response.headers;
  check(h['x-frame-options']?.toUpperCase() === 'DENY', `${path}: framing is denied`);
  check(
    h['x-content-type-options']?.toLowerCase() === 'nosniff',
    `${path}: MIME sniffing is disabled`,
  );
  const hsts = h['strict-transport-security'] || '';
  const maxAge = Number(/(?:^|;)\s*max-age=(\d+)/i.exec(hsts)?.[1]);
  check(
    maxAge >= 31536000 && /(?:^|;)\s*includeSubDomains(?:;|$)/i.test(hsts),
    `${path}: HSTS lasts at least one year and includes subdomains`,
  );
  const csp = new Map(
    (h['content-security-policy'] || '').split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values.join(' ')];
    }),
  );
  const required = {
    'default-src': "'self'",
    'script-src': "'self'",
    'frame-ancestors': "'none'",
    'frame-src': "'none'",
    'object-src': "'none'",
    'base-uri': "'none'",
  };
  check(
    Object.entries(required).every(([key, value]) => csp.get(key) === value) &&
      csp.has('upgrade-insecure-requests'),
    `${path}: the expected restrictive CSP is present`,
  );
  if (path.startsWith('/api/'))
    check(
      /(?:^|,)\s*no-store(?:,|$)/i.test(h['cache-control'] || ''),
      `${path}: API responses cannot be cached`,
    );
}
async function run(label, fn) {
  try {
    await fn();
  } catch (error) {
    check(false, `${label}: ${error.code || error.message}`);
  }
}

console.log(`Checking ${origin} (read-only requests; no credentials).`);
for (const path of ['/', '/privacy?deployment-check=1']) {
  await run(`HTTP ${path}`, async () => {
    const target = new URL(path, origin);
    const plain = new URL(target);
    plain.protocol = 'http:';
    const response = await get(plain);
    let redirect;
    try {
      redirect = new URL(response.headers.location, plain).href;
    } catch {
      /* missing/invalid */
    }
    check(
      [301, 302, 307, 308].includes(response.status) && redirect === target.href,
      `HTTP ${path}: redirects directly to the same path on the canonical HTTPS origin`,
    );
  });
}
for (const [path, status] of [
  ['/', 200],
  ['/api/health', 200],
  ['/api/me', 401],
  ['/api/entries', 401],
  ['/api/account', 401],
  ['/api/export', 401],
  ['/debug', 404],
  ['/staging', 404],
  ['/admin', 404],
  ['/.env', 404],
  ['/api/debug', 404],
  ['/api/admin', 404],
]) {
  await run(`HTTPS ${path}`, async () => {
    const response = await get(new URL(path, origin));
    check(response.status === status, `${path}: HTTP ${status} (received ${response.status})`);
    if (path === '/') {
      check(
        response.tls.authorized && ['TLSv1.2', 'TLSv1.3'].includes(response.tls.protocol),
        'The server certificate passes chain/hostname verification; negotiated TLS is 1.2 or 1.3',
      );
      const days = (Date.parse(response.tls.expires) - Date.now()) / 86400000;
      check(
        Number.isFinite(days) && days > 0,
        `Certificate expiry: ${response.tls.expires || 'unavailable'}`,
      );
      if (days > 0 && days < 14)
        console.log(
          `NOTE Certificate expires in ${Math.floor(days)} days; verify automatic renewal.`,
        );
    }
    if (path === '/api/health')
      check(JSON.parse(response.body).status === 'ok', 'Health endpoint can reach the database');
    headers(response, path);
  });
}
console.log(`\n${failed ? `${failed} check(s) failed.` : 'All checks passed.'}`);
console.log('This does not test OAuth, account flows, database exposure, backups, DDoS capacity,');
console.log(
  'certificate renewal, or rejection of every legacy TLS version. Keep the staging checklist.',
);
process.exitCode = failed ? 1 : 0;
