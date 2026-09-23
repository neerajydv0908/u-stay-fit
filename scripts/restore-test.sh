#!/usr/bin/env bash
# Restores only into an isolated, temporary container. No ports or live data volumes.
set -euo pipefail
umask 077
source "$(dirname "$0")/deploy/backup-secret.sh"
file="${1:?Path to an encrypted .dump.gz.gpg backup}"
name="usf-restore-test-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Trust is confined to the temporary container's Unix socket; networking is disabled.
docker run -d --network none --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restore_test postgres:17 >/dev/null
ready=false
for _ in $(seq 1 30); do
  if docker exec "$name" pg_isready -U postgres -d restore_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'Temporary database did not become ready.' >&2; exit 1; fi
gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 "$file" | gunzip \
  | docker exec -i "$name" pg_restore -U postgres -d restore_test --no-owner --no-privileges --exit-on-error
docker exec "$name" psql -U postgres -d restore_test -v ON_ERROR_STOP=1 -Atc "
  SELECT 'users: ' || count(*) FROM users
  UNION ALL SELECT 'profiles: ' || count(*) FROM profiles
  UNION ALL SELECT 'entries: ' || count(*) FROM entries
  UNION ALL SELECT 'schema version: ' || max(id) FROM schema_migrations;"
docker rm -f "$name" >/dev/null
trap - EXIT
echo 'Restore succeeded; temporary container removed.'
