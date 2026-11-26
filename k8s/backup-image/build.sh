#!/usr/bin/env bash
# Build and push the backup image. The script is copied in from scripts/backup-to-s3.sh so there is one source.
#   k8s/backup-image/build.sh 20261126-1
set -euo pipefail
TAG="${1:?usage: $0 <tag>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cp "$HERE/../../scripts/backup-to-s3.sh" "$HERE/backup-to-s3.sh"
trap 'rm -f "$HERE/backup-to-s3.sh"' EXIT
docker buildx build --platform linux/amd64,linux/arm64 -t "stejose/prism-backup:$TAG" --push "$HERE"
echo "pushed stejose/prism-backup:$TAG. Put that tag in k8s/backup-cronjob.yaml."
