import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile);
// Transport doubles inspect the shell pipeline, FD use, and output permissions.
// They do not simulate cryptography or establish that production backups restore.
test('F8: backup/restore pass the secret through FD 3, protect outputs, reject broad secret permissions', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'usf-backup-test-'));
  try {
    const bin = join(temp, 'bin');
    await mkdir(bin);
    const secret = 'SYNTHETIC-TEST-PASSPHRASE-never-a-process-argument';
    const secretFile = join(temp, 'key');
    await writeFile(secretFile, secret, { mode: 0o600 });
    await writeFile(
      join(bin, 'docker'),
      `#!${process.execPath}\nconst a=process.argv.slice(2);if(a.includes('pg_dump'))process.stdout.write('TEST_DUMP');else if(a.includes('pg_restore')){let t='';for await(const c of process.stdin)t+=c;if(t!=='TEST_DUMP')process.exit(1);}else if(a.includes('psql'))process.stdout.write('users: 0\\n');else if(a.includes('run'))process.stdout.write('temporary-container\\n');`,
      { mode: 0o700 },
    );
    await writeFile(
      join(bin, 'gpg'),
      `#!${process.execPath}\nimport fs from 'node:fs';const a=process.argv.slice(2);if(a.includes('--passphrase')||a.some(x=>x.includes('SYNTHETIC')))process.exit(2);if(a[a.indexOf('--passphrase-fd')+1]!=='3'||fs.readFileSync(3,'utf8')!==${JSON.stringify(secret)})process.exit(3);if(a.includes('--decrypt'))process.stdout.write(fs.readFileSync(a.at(-1)));else{const chunks=[];for await(const c of process.stdin)chunks.push(c);fs.writeFileSync(a[a.indexOf('-o')+1],Buffer.concat(chunks),{flag:'wx'});}`,
      { mode: 0o700 },
    );
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_PASSPHRASE_FILE: secretFile,
    };
    const dest = join(temp, 'backups');
    const result = await exec('bash', [resolve('scripts/backup.sh'), dest], { env });
    const backup = result.stdout.trim();
    assert.ok(backup.startsWith(dest + '/u-stay-fit-'));
    assert.equal((await stat(backup)).mode & 0o777, 0o600);
    assert.equal((await stat(dest)).mode & 0o777, 0o700);
    assert.match(
      (await exec('bash', [resolve('scripts/restore-test.sh'), backup], { env })).stdout,
      /Restore succeeded/,
    );
    await chmod(secretFile, 0o644);
    await assert.rejects(
      () => exec('bash', [resolve('scripts/backup.sh'), dest], { env }),
      (error) => error.stderr.includes('chmod 600'),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
