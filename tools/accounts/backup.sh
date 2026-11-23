#!/usr/bin/env bash
# Nightly accounts backup, step 1 of 2: dump the accounts database and encrypt
# it in one stream. Plain SQL never touches the disk; only the encrypted file
# is written. See docs/accounts/OPERATIONS.md ("Nightly backup").
#
# Settings (names only; values come from the GitHub environment
# `accounts-backup`, or the operator's shell for a drill):
#   ACCOUNTS_BACKUP_DATABASE_URL  secret. Direct (not `-pooler`) connection of a
#                                 role that can read every account table with
#                                 row security bypassed (the migration
#                                 administrator, or a read-only BYPASSRLS role).
#   ACCOUNTS_BACKUP_AGE_RECIPIENT public age key (age1...). The matching private
#                                 key stays with the owner, never in GitHub.
#   ACCOUNTS_BACKUP_OUT_DIR       where to write the file (default: current dir).
#   ACCOUNTS_BACKUP_PG_DUMP_IMAGE optional container image (e.g. postgres:18)
#                                 that provides a pg_dump at least as new as the
#                                 server; without it the local pg_dump is used.
#
# Prints the file path. Exits non-zero, leaving no file, on any failure.
set -euo pipefail

if [[ -z "${ACCOUNTS_BACKUP_DATABASE_URL:-}" || -z "${ACCOUNTS_BACKUP_AGE_RECIPIENT:-}" ]]; then
  echo "Accounts backup is not configured (ACCOUNTS_BACKUP_DATABASE_URL and ACCOUNTS_BACKUP_AGE_RECIPIENT). Nothing was read or written." >&2
  exit 2
fi
if [[ ! "$ACCOUNTS_BACKUP_AGE_RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]]; then
  echo "ACCOUNTS_BACKUP_AGE_RECIPIENT is not an age public key. Nothing was read or written." >&2
  exit 2
fi
if [[ "$ACCOUNTS_BACKUP_DATABASE_URL" == *-pooler.* ]]; then
  echo "Use the direct (not -pooler) connection for the backup. Nothing was read or written." >&2
  exit 2
fi
command -v age >/dev/null || { echo "age is not installed." >&2; exit 2; }

out_dir="${ACCOUNTS_BACKUP_OUT_DIR:-.}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$out_dir/accounts-$stamp.sql.gz.age"
umask 077
trap 'rm -f "$file"' ERR

dump() {
  # The URL is passed through the environment, never on a command line.
  local flags=(--no-owner --no-privileges --format=plain --lock-wait-timeout=30000)
  if [[ -n "${ACCOUNTS_BACKUP_PG_DUMP_IMAGE:-}" ]]; then
    docker run --rm --network host -e ACCOUNTS_BACKUP_DATABASE_URL "$ACCOUNTS_BACKUP_PG_DUMP_IMAGE" \
      sh -c 'exec pg_dump --dbname="$ACCOUNTS_BACKUP_DATABASE_URL" "$@"' pg_dump "${flags[@]}"
  else
    PGCONNECT_TIMEOUT=15 pg_dump --dbname="$ACCOUNTS_BACKUP_DATABASE_URL" "${flags[@]}"
  fi
}

dump | gzip -9 | age --encrypt --recipient "$ACCOUNTS_BACKUP_AGE_RECIPIENT" --output "$file"
# A dump of the migrated schema is never tiny; an empty stream means pg_dump wrote nothing.
if [[ ! -s "$file" || $(stat -c %s "$file") -lt 1024 ]]; then
  rm -f "$file"
  echo "The backup came out empty." >&2
  exit 1
fi
echo "$file"
