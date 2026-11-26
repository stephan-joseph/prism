#!/bin/sh
# Runs inside the hourly backup pod (k8s/backup-cronjob.yaml). Tars /data and uploads it to S3.
# Needs: tar, gzip and the AWS CLI. Settings (all from the CronJob's environment):
#   S3_BUCKET   bucket name, no s3:// (required)
#   S3_PREFIX   folder in the bucket (default prism)
#   DATA_DIR    what to back up (default /data)
#   KEEP_DAILY  1 = also copy the 00:00 UTC backup to daily/ (default 1)
#   S3_ENDPOINT only for tests against a local S3 server
# The backup holds password hashes: the bucket must be private and encrypted. Nothing secret is printed.
set -eu

BUCKET="${S3_BUCKET:-}"; [ -n "$BUCKET" ] || { echo "backup failed: S3_BUCKET is not set" >&2; exit 1; }
PREFIX="${S3_PREFIX:-prism}"
DATA="${DATA_DIR:-/data}"
EP=""; [ -n "${S3_ENDPOINT:-}" ] && EP="--endpoint-url $S3_ENDPOINT"
NOW="$(date -u +%Y%m%d-%H%M%S)"
FILE="/tmp/prism-backup-$NOW.tgz"
trap 'rm -f "$FILE" "$FILE.list"' EXIT

[ -d "$DATA" ] || { echo "backup failed: $DATA is not mounted" >&2; exit 1; }

# Files on the volume are written to a temporary name and renamed, so a half-written file is never read.
# Leftover temporary names from a crash are skipped.
tar czf "$FILE" -C "$DATA" --exclude='*.tmp[0-9]*-[0-9]*' . || { echo "backup failed: tar did not finish" >&2; exit 1; }

# a backup you have not looked inside is not a backup
tar tzf "$FILE" > "$FILE.list" 2>/dev/null || { echo "backup failed: the archive is not valid" >&2; exit 1; }
ACCOUNTS="$(grep -cE '^(\./)?users/[^/]+$' "$FILE.list" || true)"
DEALS="$(grep -cE '^(\./)?estimates/[^/]+$' "$FILE.list" || true)"
EVENTS="$(grep -cE '^(\./)?audit/[^/]+$' "$FILE.list" || true)"
if [ "$ACCOUNTS" -eq 0 ]; then
  # an empty volume would overwrite nothing, but it must not look like a good backup either
  echo "backup skipped: the volume holds no accounts, so there is nothing worth keeping" >&2; exit "${SKIP_EXIT:-2}"
fi

KEY="$PREFIX/hourly/prism-backup-$NOW.tgz"
# shellcheck disable=SC2086
aws $EP s3 cp "$FILE" "s3://$BUCKET/$KEY" --only-show-errors --sse AES256 || { echo "backup failed: the upload to s3://$BUCKET/$KEY failed" >&2; exit 1; }
# shellcheck disable=SC2086
aws $EP s3api head-object --bucket "$BUCKET" --key "$KEY" >/dev/null || { echo "backup failed: the file is not in the bucket after the upload" >&2; exit 1; }

if [ "${KEEP_DAILY:-1}" = 1 ] && [ "$(date -u +%H)" = "00" ]; then
  # shellcheck disable=SC2086
  aws $EP s3 cp "s3://$BUCKET/$KEY" "s3://$BUCKET/$PREFIX/daily/prism-backup-$NOW.tgz" --only-show-errors --sse AES256 || echo "warning: the daily copy failed" >&2
fi
echo "backup ok: $KEY, $(wc -c < "$FILE" | tr -d ' ') bytes, $ACCOUNTS accounts, $DEALS deals, $EVENTS audit events"
