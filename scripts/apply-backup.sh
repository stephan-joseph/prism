#!/usr/bin/env bash
# Apply the hourly backup CronJob with your real bucket name and image tag, without writing them into git.
#   scripts/apply-backup.sh            apply it
#   scripts/apply-backup.sh --test     apply it, then run one backup now and show its log
# Reads k8s/backup.local.env (copy k8s/backup.local.env.example). Needs a working kubectl login.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="${BACKUP_ENV:-$HERE/k8s/backup.local.env}"
[ -f "$ENVF" ] || { echo "Missing $ENVF. Copy k8s/backup.local.env.example to it and fill it in." >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENVF"; set +a
: "${S3_BUCKET:?S3_BUCKET is missing in $ENVF}"; : "${BACKUP_IMAGE_TAG:?BACKUP_IMAGE_TAG is missing in $ENVF}"
case "$S3_BUCKET" in CHANGE-ME*|your-*) echo "S3_BUCKET in $ENVF is still a placeholder." >&2; exit 1;; esac
OUT="$(mktemp)"; trap 'rm -f "$OUT"' EXIT
sed -e "s#CHANGE-ME-your-private-bucket#$S3_BUCKET#" -e "s#CHANGE-ME-tag#$BACKUP_IMAGE_TAG#" -e "s#S3_PREFIX: \"prism\"#S3_PREFIX: \"${S3_PREFIX:-prism}\"#" "$HERE/k8s/backup-cronjob.yaml" > "$OUT"
grep -q "CHANGE-ME" "$OUT" && { echo "A CHANGE-ME placeholder is left in the manifest." >&2; exit 1; }
kubectl apply -f "$OUT"
kubectl -n prism-damo get cronjob prism-backup
if [ "${1:-}" = "--test" ]; then
  J="prism-backup-test-$(date +%H%M%S)"
  kubectl -n prism-damo create job --from=cronjob/prism-backup "$J"
  echo "Waiting for $J ..."
  kubectl -n prism-damo wait --for=condition=complete "job/$J" --timeout=180s || { echo "The job did not finish. Log:" >&2; kubectl -n prism-damo logs "job/$J" --tail=30 >&2 || true; echo "Pod state:" >&2; kubectl -n prism-damo describe pod -l job-name="$J" | tail -15 >&2; exit 1; }
  kubectl -n prism-damo logs "job/$J" --tail=5
  kubectl -n prism-damo delete job "$J" >/dev/null
fi
