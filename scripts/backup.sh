#!/usr/bin/env bash
# Usage: BACKUP_PASSPHRASE_FILE=/protected/path scripts/backup.sh /secure/backups
# The environment contains a file path, never the passphrase itself.
set -euo pipefail
umask 077
source "$(dirname "$0")/deploy/backup-secret.sh"
dest="${1:-./backups}"
mkdir -p "$dest"
chmod 700 "$dest"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dest/u-stay-fit-$stamp-$$.dump.gz.gpg"
complete=false
cleanup() { if [[ "$complete" != true ]]; then rm -f -- "$file"; fi; }
trap cleanup EXIT
docker compose -f compose.deploy.yml exec -T db pg_dump -U usf_admin -d u_stay_fit -Fc \
  | gzip \
  | gpg --batch --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-fd 3 -o "$file"
complete=true
# stdout provides a single filename for the off-host copy job. Do not remove older copies
# until the off-host upload and restore verification succeed (see deployment guide).
echo "$file"
