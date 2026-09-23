// Run on the deployment host. Never prints, overwrites, or commits a secret.
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
await mkdir('.secrets', { recursive: true, mode: 0o700 });
await chmod('.secrets', 0o700);
for (const name of [
  'db_admin_password',
  'db_migrator_password',
  'db_app_password',
  'db_reader_password',
  'app_secret',
  'backup_passphrase',
]) {
  try {
    await writeFile(`.secrets/${name}`, randomBytes(48).toString('base64url') + '\n', {
      flag: 'wx',
      mode: name === 'backup_passphrase' ? 0o600 : 0o444,
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}
console.log(
  'Secret files created; existing files were preserved. Store a recovery copy in your password manager.',
);
