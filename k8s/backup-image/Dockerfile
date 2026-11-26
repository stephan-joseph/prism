# The hourly backup pod: tar, gzip and the AWS CLI, nothing else. Built once and pinned in k8s/backup-cronjob.yaml.
#   docker buildx build --platform linux/amd64,linux/arm64 -t stejose/prism-backup:<tag> --push k8s/backup-image
FROM alpine:3.20
RUN apk add --no-cache aws-cli tar gzip \
 && adduser -D -u 1000 backup
COPY backup-to-s3.sh /usr/local/bin/backup-to-s3.sh
RUN chmod 0555 /usr/local/bin/backup-to-s3.sh
USER 1000
ENTRYPOINT ["/bin/sh", "/usr/local/bin/backup-to-s3.sh"]
