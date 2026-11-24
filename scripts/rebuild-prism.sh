#!/usr/bin/env bash
# Rebuild Prism and the Prism Library on a new EKS cluster, and restore the accounts from the latest backup.
#
#   scripts/rebuild-prism.sh [cluster-name]        build everything (about 25 minutes, and it bills while it runs)
#   scripts/rebuild-prism.sh --check               only check tools, login, files and backups, create nothing
#   scripts/rebuild-prism.sh --resume [name]       carry on with a cluster that already exists (after a failed run)
#
# Secrets are asked for first, silently, before anything is created. To run without prompts, set them in the
# environment: ANTHROPIC_AUTH_TOKEN (and/or ANTHROPIC_API_KEY), ADMIN_EMAIL, ADMIN_PASSWORD. ASSUME_YES=1 skips the questions.
# Settings: REGION (ap-southeast-1), APP_DIR, LIB_DIR, BACKUP_DIR (~/prism-backups), AWS_PROFILE (your AWS login).
# SESSION_SECRET is generated here and never shown. Nothing secret is written to the repo or to a log.
set -Eeuo pipefail

REGION="${REGION:-ap-southeast-1}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LIB_DIR="${LIB_DIR:-$APP_DIR/../prism-library}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/prism-backups}"
NODEGROUP="prism-nodes"
CHECK=0; RESUME=0; NAME_ARG=""
for a in "$@"; do case "$a" in --check) CHECK=1;; --resume) RESUME=1;; -h|--help) sed -n 2,12p "$0"; exit 0;; -*) echo "Unknown option $a" >&2; exit 2;; *) NAME_ARG="$a";; esac; done
NAME="${NAME_ARG:-${CLUSTER_NAME:-prism-$(date +%m%d)}}"

STEP="checking"; CREATED=0; ENVF=""
die() { echo "Stopped: $*" >&2; exit 1; }
say() { echo; echo "==> $*"; }
cleanup() { [ -n "$ENVF" ] && rm -f "$ENVF"; }
on_error() {
  local code=$?
  echo >&2; echo "FAILED during: $STEP (exit $code)" >&2
  if [ "$CREATED" = 1 ] || [ "$RESUME" = 1 ]; then
    echo "The cluster $NAME exists and is billing. Fix the cause, then continue with:  $0 --resume $NAME" >&2
    echo "To throw it away instead:  eksctl delete cluster --name $NAME --region $REGION" >&2
  fi
  exit "$code"
}
trap on_error ERR
trap cleanup EXIT

# ---- 1. checks, before anything costs money ----
say "Checking tools, login, files and backups"
for t in aws eksctl kubectl openssl curl; do command -v "$t" >/dev/null 2>&1 || die "$t is not installed"; done
for f in "$APP_DIR/k8s/pvc.yaml" "$APP_DIR/k8s/deployment.yaml" "$APP_DIR/k8s/service.yaml" "$APP_DIR/scripts/restore-data.sh" \
         "$LIB_DIR/k8s/deployment.yaml" "$LIB_DIR/k8s/service.yaml"; do
  [ -f "$f" ] || die "missing $f (set APP_DIR or LIB_DIR if the repos live elsewhere)"
done
aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 \
  || die "no working AWS login. Sign in first (for example: aws login --profile prism, then export AWS_PROFILE=prism)."
EXISTS=0; if eksctl get cluster --name "$NAME" --region "$REGION" >/dev/null 2>&1; then EXISTS=1; fi
[ "$EXISTS" = 1 ] && [ "$RESUME" = 0 ] && die "cluster $NAME already exists. Use --resume to continue on it, or pick another name: $0 other-name"
[ "$EXISTS" = 0 ] && [ "$RESUME" = 1 ] && die "--resume needs an existing cluster called $NAME"
LATEST=""
if [ -d "$BACKUP_DIR" ]; then LATEST="$(ls -t "$BACKUP_DIR"/prism-backup-*.tgz 2>/dev/null | head -1 || true)"; fi
if [ -n "$LATEST" ]; then echo "Latest backup: $LATEST"; else echo "No backup in $BACKUP_DIR. Only the first admin will exist after the rebuild."; fi
echo "Cluster: $NAME in $REGION. App: $APP_DIR. Library: $LIB_DIR."
[ "$CHECK" = 1 ] && { echo; echo "Checks passed. Nothing was created."; exit 0; }

# ---- 2. secrets, asked for first so you are not waiting 15 minutes to be prompted ----
ask() {   # ask VAR "prompt" required(1/0)
  local var="$1" prompt="$2" req="$3" cur="${!1:-}"
  if [ -z "$cur" ] && [ -t 0 ]; then read -rsp "$prompt: " cur; echo; fi
  if [ -z "$cur" ] && [ "$req" = 1 ]; then die "$var is needed. Set it in the environment or run this in a terminal."; fi
  printf -v "$var" '%s' "$cur"
}
say "Sign-in and extraction settings (typing is hidden; press Enter to skip an optional one)"
ask ANTHROPIC_AUTH_TOKEN "ANTHROPIC_AUTH_TOKEN (the gateway token)" 0
ask ANTHROPIC_API_KEY "ANTHROPIC_API_KEY (only if no gateway token)" 0
[ -n "$ANTHROPIC_AUTH_TOKEN$ANTHROPIC_API_KEY" ] || die "give a gateway token or an API key, or extraction will not work"
ask ADMIN_EMAIL "Admin email (the first administrator)" 1
ask ADMIN_PASSWORD "Admin first-login password, 12 or more characters (you change it at first sign-in)" 1
echo "$ADMIN_EMAIL" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' || die "ADMIN_EMAIL is not a valid email"
[ "${#ADMIN_PASSWORD}" -ge 12 ] || die "ADMIN_PASSWORD needs at least 12 characters"
if [ "${ASSUME_YES:-0}" != 1 ] && [ "$RESUME" = 0 ]; then
  read -rp "Create cluster $NAME now? It bills until you delete it. Type yes: " ok; [ "$ok" = yes ] || { echo "Cancelled."; exit 1; }
fi

# ---- 3. cluster ----
if [ "$RESUME" = 0 ]; then
  STEP="creating the cluster (about 15 minutes)"; say "Creating cluster $NAME"
  CREATED=1
  eksctl create cluster --name "$NAME" --region "$REGION" --nodegroup-name "$NODEGROUP" \
    --nodes 2 --nodes-min 2 --nodes-max 3 --node-type t3.medium --managed
else
  STEP="connecting to the cluster"; say "Resuming on $NAME"
  eksctl utils write-kubeconfig --cluster "$NAME" --region "$REGION"
fi

STEP="adding the storage driver"; say "Storage: EBS policy and driver"
ROLE_ARN="$(aws eks describe-nodegroup --cluster-name "$NAME" --nodegroup-name "$NODEGROUP" --region "$REGION" --query nodegroup.nodeRole --output text)"
ROLE="${ROLE_ARN##*/}"
[ -n "$ROLE" ] && [ "$ROLE" != None ] || die "could not find the node role of nodegroup $NODEGROUP"
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy
if ! aws eks describe-addon --cluster-name "$NAME" --addon-name aws-ebs-csi-driver --region "$REGION" >/dev/null 2>&1; then
  eksctl create addon --name aws-ebs-csi-driver --cluster "$NAME" --region "$REGION"
fi
aws eks wait addon-active --cluster-name "$NAME" --addon-name aws-ebs-csi-driver --region "$REGION"
kubectl get storageclass gp2 >/dev/null 2>&1 || die "the cluster has no storage class gp2, which k8s/pvc.yaml asks for. Run: kubectl get storageclass"

# ---- 4. namespaces and the secret ----
STEP="creating namespaces and the secret"; say "Namespaces and secret"
for ns in prism-damo prism-library; do kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f -; done
umask 077; ENVF="$(mktemp)"
{
  [ -n "$ANTHROPIC_AUTH_TOKEN" ] && printf 'ANTHROPIC_AUTH_TOKEN=%s\n' "$ANTHROPIC_AUTH_TOKEN"
  [ -n "$ANTHROPIC_API_KEY" ] && printf 'ANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_API_KEY"
  printf 'SESSION_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
  printf 'ADMIN_EMAIL=%s\n' "$ADMIN_EMAIL"
  printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD"
} > "$ENVF"
kubectl -n prism-damo create secret generic prism-secrets --from-env-file="$ENVF" --dry-run=client -o yaml | kubectl apply -f -
rm -f "$ENVF"; ENVF=""

# ---- 5. Library first, so the app can be given its address ----
wait_host() {   # wait_host namespace service
  local i h
  for i in $(seq 1 60); do
    h="$(kubectl -n "$1" get svc "$2" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
    if [ -n "$h" ]; then echo "$h"; return 0; fi
    sleep 10
  done
  return 1
}
STEP="deploying the Library"; say "Library"
kubectl apply -f "$LIB_DIR/k8s/deployment.yaml" -f "$LIB_DIR/k8s/service.yaml"
kubectl -n prism-library rollout status deployment/prism-library --timeout=300s
LIB_HOST="$(wait_host prism-library prism-library)" || die "the Library load balancer has no address after 10 minutes"

# ---- 6. the app, with the Library's new address ----
STEP="deploying the app"; say "Prism (volume, then app, then service)"
kubectl apply -f "$APP_DIR/k8s/pvc.yaml"
# the address in git is the old one. Swap it in a copy, so the live cluster is right and the repo is untouched.
sed -E "s#value: http://[A-Za-z0-9.-]+\.elb\.amazonaws\.com#value: http://$LIB_HOST#" "$APP_DIR/k8s/deployment.yaml" > /tmp/prism-deployment.$$.yaml
grep -q "$LIB_HOST" /tmp/prism-deployment.$$.yaml || { rm -f /tmp/prism-deployment.$$.yaml; die "could not put the Library address into the app manifest (no LIBRARY_URL value found)"; }
kubectl apply -f /tmp/prism-deployment.$$.yaml; rm -f /tmp/prism-deployment.$$.yaml
kubectl apply -f "$APP_DIR/k8s/service.yaml"
kubectl -n prism-damo rollout status deployment/prism --timeout=300s
APP_HOST="$(wait_host prism-damo prism)" || die "the app load balancer has no address after 10 minutes"

# ---- 7. restore the accounts ----
STEP="restoring the backup"; say "Restoring accounts"
if [ -n "$LATEST" ]; then
  echo "Using $LATEST"
  YESFLAG=""; [ "${ASSUME_YES:-0}" = 1 ] && YESFLAG="--yes"
  ( cd "$BACKUP_DIR" && "$APP_DIR/scripts/restore-data.sh" "$LATEST" $YESFLAG )
else
  echo "No backup, so only the first admin exists. Add everyone else on the Users page."
fi

# ---- 8. is it up? ----
STEP="checking the site"; say "Checking the site (a new load balancer can take a few minutes to resolve)"
UP=0
for i in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://$APP_HOST/healthz" || true)" = 200 ]; then UP=1; break; fi
  sleep 10
done
if [ "$UP" = 1 ]; then
  echo "healthz: ok"; echo "sign-in: $(curl -s -m 10 "http://$APP_HOST/api/me" || true)"
else
  echo "Not answering yet. Try again in a few minutes: curl -s http://$APP_HOST/healthz"
fi

echo
echo "Done."
echo "  App:     http://$APP_HOST"
echo "  Library: http://$LIB_HOST"
echo
echo "Now:"
echo "  1. Put the Library address in k8s/deployment.yaml (LIBRARY_URL) and commit it. The cluster already has it; git still has the old one."
echo "  2. Tell the team the new App address. Everyone is signed out (a new session secret), and accounts are back only if a backup was restored."
echo "  3. The Library's own curated deals are NOT restored. Its volume starts empty (LIBRARY_SEED=sample loads the samples only)."
echo "  4. Back up again once things settle: scripts/backup-data.sh, then move the file into $BACKUP_DIR."
echo "  5. The addresses are plain http. Limit the load balancers to a known address range until there is https."
echo "  6. When you no longer need this cluster:  eksctl delete cluster --name $NAME --region $REGION"
