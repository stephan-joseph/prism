#!/usr/bin/env bash
# How old is the newest backup in S3? Exits 1 if it is older than MAX_HOURS (default 3), so you can run it from anything that alerts.
#   S3_BUCKET=my-bucket scripts/backup-age.sh
# Settings: S3_BUCKET (required), S3_PREFIX (prism), MAX_HOURS (3), S3_ENDPOINT (tests only).
set -euo pipefail
# the bucket name can come from k8s/backup.local.env (git-ignored) when S3_BUCKET is not set
_LOCAL="$(cd "$(dirname "$0")/.." && pwd)/k8s/backup.local.env"
if [ -z "${S3_BUCKET:-}" ] && [ -f "$_LOCAL" ]; then S3_BUCKET="$(sed -n 's/^S3_BUCKET=//p' "$_LOCAL" | head -1)"; S3_PREFIX="${S3_PREFIX:-$(sed -n 's/^S3_PREFIX=//p' "$_LOCAL" | head -1)}"; fi
BUCKET="${S3_BUCKET:?Set S3_BUCKET to the backup bucket name}"
PREFIX="${S3_PREFIX:-prism}"; MAX="${MAX_HOURS:-3}"
EP=(); [ -n "${S3_ENDPOINT:-}" ] && EP=(--endpoint-url "$S3_ENDPOINT")
ERR="$(mktemp)"; trap 'rm -f "$ERR"' EXIT
if ! RAW="$(aws ${EP[@]+"${EP[@]}"} s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/hourly/" --query 'sort_by(Contents||`[]`,&LastModified)[-1].LastModified' --output text 2>"$ERR")"; then
  echo "Could not read the bucket (this is not the same as having no backups):" >&2; cat "$ERR" >&2; exit 2
fi
LM="$(printf '%s' "$RAW" | grep -v '^None$' || true)"
[ -n "$LM" ] || { echo "NO BACKUPS found in s3://$BUCKET/$PREFIX/hourly/" >&2; exit 1; }
THEN="$(date -u -d "$LM" +%s 2>/dev/null || python3 -c "import sys,datetime;print(int(datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00')).timestamp()))" "$LM")"
AGE=$(( ( $(date -u +%s) - THEN ) / 60 ))
echo "Newest backup: $LM ($((AGE/60)) h $((AGE%60)) min ago)"
[ "$AGE" -le $((MAX*60)) ] || { echo "STALE: older than $MAX hours. The hourly job may be failing: kubectl -n prism-damo get jobs; kubectl -n prism-damo logs -l app=prism-backup --tail=20" >&2; exit 1; }
