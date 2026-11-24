#!/usr/bin/env bash
# Restore a backup made by scripts/backup-data.sh into the running prism pod.
#
#   scripts/restore-data.sh <backup-file> [--yes]
#
# Files in the backup replace files of the same name in /data. Accounts created since the backup are kept
# (nothing is deleted). People stay signed in, because their account records come back unchanged.
# Before it changes anything it saves what is there now to prism-prerestore-<time>.tgz, so you can undo it.
# Needs a working kubectl login and a running prism pod with the volume mounted.
set -euo pipefail

NS="${NS:-prism-damo}"
KUBECTL="${KUBECTL:-kubectl}"
FILE="${1:-}"
YES="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then echo "Usage: $0 <backup-file> [--yes]" >&2; exit 1; fi
tar tzf "$FILE" > /tmp/.prism-restore-list.$$ 2>/dev/null || { rm -f /tmp/.prism-restore-list.$$; echo "$FILE is not a valid archive." >&2; exit 1; }
# only plain files under users/, audit/, usage/ or estimates/ are allowed, nothing that climbs out of /data
if grep -vE '^(\./)?(users|audit|usage|estimates)(/[A-Za-z0-9._%@~+=,:-]*)?/?$|^\./?$' /tmp/.prism-restore-list.$$ | grep -q .; then
  rm -f /tmp/.prism-restore-list.$$; echo "The archive holds paths this tool does not restore, so nothing was done." >&2; exit 1
fi
if grep -qE '(^|/)\.\.(/|$)' /tmp/.prism-restore-list.$$; then rm -f /tmp/.prism-restore-list.$$; echo "The archive has unsafe paths." >&2; exit 1; fi
accounts=$(grep -cE '^(\./)?users/[^/]+$' /tmp/.prism-restore-list.$$ || true)
events=$(grep -cE '^(\./)?audit/[^/]+$' /tmp/.prism-restore-list.$$ || true)
rm -f /tmp/.prism-restore-list.$$

echo "Restore $FILE into namespace $NS: $accounts accounts, $events audit events."
if [ "$YES" != "--yes" ]; then
  printf "Type yes to continue: "; read -r a; [ "$a" = "yes" ] || { echo "Cancelled."; exit 1; }
fi

SAFETY="prism-prerestore-$(date +%Y%m%d-%H%M%S).tgz"
echo "Saving the current data to $SAFETY first ..."
"$HERE/backup-data.sh" "$SAFETY" || { echo "Could not save the current data, so nothing was restored." >&2; exit 1; }

echo "Restoring ..."
"$KUBECTL" -n "$NS" exec -i deploy/prism -- tar xzf - -C /data < "$FILE"
echo "Done. Check: sign in, then open the Users page. To undo: $0 $SAFETY"
