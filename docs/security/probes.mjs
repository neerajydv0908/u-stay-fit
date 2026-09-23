// The original diagnostic reproduced vulnerabilities. This entry point now asserts that
// the corrected behavior stays fixed. See ../security-hardening.md for the resolution record.
import { spawn } from 'node:child_process';
console.log('Running security regressions against disposable test data.');
const child = spawn(
  process.execPath,
  ['--test', '--test-concurrency=1', 'tests/api.test.js', 'tests/security.test.js'],
  { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', TEST_DATABASE_URL: '' } },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
