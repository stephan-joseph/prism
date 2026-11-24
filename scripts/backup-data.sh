#!/usr/bin/env bash
# Back up Prism's data (accounts, audit log, usage history, and anything else under /data) to one file on this machine.
#
#   scripts/backup-data.sh [output-file]
#
# The file holds password HASHES and the audit log. Store it like a secret: a password manager's file store,
# an encrypted disk or a private bucket. Never commit it (prism-backup-*.tgz is in .gitignore).
# Needs a working kubectl login to the cluster. Settings: NS (namespace, default prism-damo), KUBECTL (default kubectl).
set -euo pipefail

NS="${NS:-prism-damo}"
KUBECTL="${KUBECTL:-kubectl}"
OUT="${1:-prism-backup-$(date +%Y%m%d-%H%M%S).tgz}"

if [ -e "$OUT" ]; then echo "Refusing to overwrite $OUT. Pick another name." >&2; exit 1; fi
umask 077   # the backup is readable by you only

echo "Reading /data from the prism pod in namespace $NS ..."
if ! "$KUBECTL" -n "$NS" exec deploy/prism -- tar czf - -C /data . > "$OUT"; then
  rm -f "$OUT"; echo "The backup failed. Check that you are logged in to the cluster and the pod is running." >&2; exit 1
fi

# A backup you have not looked inside is not a backup.
if ! tar tzf "$OUT" > /tmp/.prism-backup-list.$$ 2>/dev/null; then
  rm -f "$OUT" /tmp/.prism-backup-list.$$; echo "The file written is not a valid archive, so it was removed." >&2; exit 1
fi
accounts=$(grep -cE '^(\./)?users/[^/]+$' /tmp/.prism-backup-list.$$ || true)
events=$(grep -cE '^(\./)?audit/[^/]+$' /tmp/.prism-backup-list.$$ || true)
runs=$(grep -cE '^(\./)?usage/[^/]+$' /tmp/.prism-backup-list.$$ || true)
rm -f /tmp/.prism-backup-list.$$
if [ "$accounts" -eq 0 ]; then
  echo "Warning: the backup holds no accounts. Is sign-in turned on, and has anyone signed in yet?" >&2
fi
echo "Saved $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes): $accounts accounts, $events audit events, $runs usage records."
echo "It contains password hashes. Keep it private and do not commit it."
