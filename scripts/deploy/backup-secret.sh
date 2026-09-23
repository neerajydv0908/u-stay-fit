#!/usr/bin/env bash
# Sourced by the backup tools. The secret stays out of command arguments and shell history.
: "${BACKUP_PASSPHRASE_FILE:?Set BACKUP_PASSPHRASE_FILE to a protected passphrase file}"
if [[ ! -f "$BACKUP_PASSPHRASE_FILE" || -L "$BACKUP_PASSPHRASE_FILE" ]]; then
  echo 'The passphrase must be a regular file, not a symbolic link.' >&2; exit 1
fi
mode="$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE" 2>/dev/null || stat -f '%Lp' "$BACKUP_PASSPHRASE_FILE")"
if [[ "$mode" != 600 && "$mode" != 400 ]]; then
  echo 'Protect the passphrase file with chmod 600 before proceeding.' >&2; exit 1
fi
exec 3<"$BACKUP_PASSPHRASE_FILE"
