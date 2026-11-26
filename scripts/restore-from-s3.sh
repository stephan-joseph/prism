#!/usr/bin/env bash
# Restore the newest hourly backup (or one you name) from S3 into the running prism pod.
#
#   scripts/restore-from-s3.sh                 newest hourly backup
#   scripts/restore-from-s3.sh daily           newest daily backup
#   scripts/restore-from-s3.sh <key-or-file>   a specific object, for example prism/hourly/prism-backup-20261126-060000.tgz
#   scripts/restore-from-s3.sh --list          list the newest 12 hourly backups and how old each is
#
# Needs: your AWS login (read access to the bucket), kubectl, and scripts/restore-data.sh. It downloads to this folder,
# then hands the file to restore-data.sh, which shows what is in it, asks you to type yes and saves the current data first.
# Settings: S3_BUCKET (required), S3_PREFIX (prism), S3_ENDPOINT (tests only).
set -euo pipefail

# the bucket name can come from k8s/backup.local.env (git-ignored) when S3_BUCKET is not set
_LOCAL="$(cd "$(dirname "$0")/.." && pwd)/k8s/backup.local.env"
if [ -z "${S3_BUCKET:-}" ] && [ -f "$_LOCAL" ]; then S3_BUCKET="$(sed -n 's/^S3_BUCKET=//p' "$_LOCAL" | head -1)"; S3_PREFIX="${S3_PREFIX:-$(sed -n 's/^S3_PREFIX=//p' "$_LOCAL" | head -1)}"; fi
BUCKET="${S3_BUCKET:?Set S3_BUCKET to the backup bucket name}"
PREFIX="${S3_PREFIX:-prism}"
HERE="$(cd "$(dirname "$0")" && pwd)"
EP=(); [ -n "${S3_ENDPOINT:-}" ] && EP=(--endpoint-url "$S3_ENDPOINT")
WHAT="${1:-hourly}"

newest() {   # newest <folder>   prints the key of the newest object
  local out; out="$(aws ${EP[@]+"${EP[@]}"} s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/$1/" --query 'sort_by(Contents||`[]`,&LastModified)[-1].Key' --output text)" || { echo "Could not read the bucket. Check S3_BUCKET and your AWS login." >&2; exit 1; }
  printf '%s' "$out" | grep -v '^None$' || true
}

if [ "$WHAT" = "--list" ]; then
  aws ${EP[@]+"${EP[@]}"} s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/hourly/" --query 'sort_by(Contents||`[]`,&LastModified)[-12:].[Key,LastModified,Size]' --output text \
    | awk '{print $2, $3" bytes", $1}' | sort -r
  exit 0
fi

case "$WHAT" in
  hourly|daily) KEY="$(newest "$WHAT")"; [ -n "$KEY" ] || { echo "No $WHAT backup found in s3://$BUCKET/$PREFIX/$WHAT/. Check the bucket name and your AWS login." >&2; exit 1; } ;;
  *) KEY="$WHAT" ;;
esac
case "$KEY" in *..*|/*) echo "That key is not allowed." >&2; exit 1;; esac

OUT="prism-from-s3-$(basename "$KEY")"
[ -e "$OUT" ] && { echo "Refusing to overwrite $OUT. Move it away first." >&2; exit 1; }
echo "Downloading s3://$BUCKET/$KEY ..."
umask 077
aws ${EP[@]+"${EP[@]}"} s3 cp "s3://$BUCKET/$KEY" "$OUT" --only-show-errors || { rm -f "$OUT"; echo "The download failed. Check the key and your AWS login." >&2; exit 1; }
LM="$(aws ${EP[@]+"${EP[@]}"} s3api head-object --bucket "$BUCKET" --key "$KEY" --query LastModified --output text 2>/dev/null || true)"
[ -n "$LM" ] && echo "This backup was saved at $LM (UTC)."
echo "Saved as $OUT. Handing it to restore-data.sh."
"$HERE/restore-data.sh" "$OUT"
