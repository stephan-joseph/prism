# Runbook: if the Prism cluster is deleted

The code and the image are safe: they sit in git and on Docker Hub (`stejose/prism`). What must come back is the **accounts** (from your backup) and the **secret values** (from your password manager).

Use a normal terminal tab for step 1, because it opens a browser. Nothing here goes in a chat. Do not paste passwords or tokens anywhere except the script's silent prompts.

## Keep ready before anything goes wrong

- The latest backup in `~/prism-backups/`, and a second copy somewhere private (it holds password hashes and the audit log).
- In your password manager: the extraction gateway token, your admin email, and a first-login password of 12 or more characters.
- Both repos on this Mac: `damo-estimator-workflow` and `prism-library`.

## Steps

**1. Sign in to AWS.**
```bash
aws configure set region ap-southeast-1 --profile prism
aws login --profile prism
export AWS_PROFILE=prism
aws sts get-caller-identity
```
The last line must print your account and user.

**2. Find a backup.** If the hourly S3 backup was set up (README, "Hourly backup to S3"), skip to step 3: you restore straight from the bucket in step 6, with `S3_BUCKET=<bucket> scripts/restore-from-s3.sh`. Otherwise put your newest file where the script looks.

**2a. (without S3)**
```bash
mkdir -p ~/prism-backups
ls -lt ~/prism-backups
```
You should see your `prism-backup-*.tgz` files, newest first. If the folder is empty, only the first admin will come back. Find your backup first.

**3. Check everything without creating anything.**
```bash
cd /Users/stephanjoseph/Documents/Proposals/Prism/damo-estimator-workflow
scripts/rebuild-prism.sh --check
```
It must end with "Checks passed". Fix whatever it names before you go on.

**4. Build.** About 25 minutes. It bills until you delete it.
```bash
scripts/rebuild-prism.sh
```
It asks for the secrets silently, then asks you to type `yes` to create the cluster. When it offers to restore the backup, type `yes` again.

**5. If it stops partway.** It prints what failed. Fix the cause, then continue:
```bash
scripts/rebuild-prism.sh --resume <the cluster name it printed>
```
To throw a half-built cluster away instead:
```bash
eksctl delete cluster --name <the cluster name> --region ap-southeast-1
```

**6. Check the new site.** The script prints the new App and Library addresses.
- Open the App address. You land on the login page.
- Sign in with the password from your **last change**, not the first-login one. The restore brings back the changed one.
- Open the Users page. Everyone is listed. Ask one person to sign in.
- If only the admin is listed, the backup was not found or the restore was skipped. Restore by hand:
```bash
scripts/restore-data.sh ~/prism-backups/<the file>
```

**7. Fix git.** The cluster has the new Library address; git still has the old one. Put the new Library address in `LIBRARY_URL` in `k8s/deployment.yaml` and commit it.

**8. Tell the team.** Send the new App address. Everyone is signed out and must sign in again. Anyone added after your last backup needs a new account.

**9. The Library's data.** Its curated deals are not restored. Its volume starts empty and only loads the samples. Re-enter them, or restore from a Library backup if you have one.

**10. Back up again straight away**, once step 6 passes. Run it from the backups folder so the file lands there:
```bash
cd ~/prism-backups
/Users/stephanjoseph/Documents/Proposals/Prism/damo-estimator-workflow/scripts/backup-data.sh
```

## When things settle

- Delete leftover load balancers and volumes from the old cluster, because they keep billing.
- The addresses are plain `http` again. Limit them to your office or VPN range until there is a certificate.
- `prism-prerestore-*.tgz` files are safety copies made by the restore. Delete them once everything works.

## What cannot be recovered without a backup

Account files. Passwords are stored only as hashes. You would add each person again on the Users page with a new one-time password.

## Keep these habits

- **The hourly backup runs by itself** once `k8s/backup-cronjob.yaml` is applied. Check it with `S3_BUCKET=<bucket> scripts/backup-age.sh`. If the cluster is rebuilt, apply the CronJob again (the bucket and its files survive).
- **Back up** after you add or remove people, after a role change, and weekly otherwise: `scripts/backup-data.sh ~/prism-backups/prism-backup-<date>.tgz` (the folder must exist). The backup holds password hashes: keep it private, never commit it.
- **Keep the disk** if the volume claim is ever deleted: `kubectl patch pv <name> -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'` (find the name with `kubectl get pv`).
- **Estimates on the server are in the backup** (`/data/estimates`), together with accounts and the audit log. Back up after people save or share, not only after adding people.
- **Back up the Library separately.** It is on its own volume.

See the README section "Backup, restore and rebuilding from scratch" for the manual version of these steps, and `scripts/rebuild-prism.sh --help` for the options. The rebuild script has not been run against a real cluster yet. Try it once in a sandbox you can afford to delete.

## Set up the hourly backup (once)

The hourly backup copies `/data` to a private S3 bucket from inside the cluster, so it needs nobody's login. Do these in your own terminal, in order, and stop at the first step that fails.

**1. Sign in and set names**
```bash
export AWS_PROFILE=prism
export REGION=ap-southeast-1
export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export BUCKET=prism-backups-$ACCOUNT
export CLUSTER=prism-1124      # the name between the last @ and .ap-southeast-1 in: kubectl config current-context
echo "$BUCKET  $CLUSTER"       # the bucket must end in a 12-digit number
```

**2. Create the private bucket** (encrypted, public access blocked, hourly files kept 14 days, daily files 90)
```bash
aws s3api create-bucket --bucket $BUCKET --region $REGION --create-bucket-configuration LocationConstraint=$REGION
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket $BUCKET --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration '{"Rules":[{"ID":"hourly","Status":"Enabled","Filter":{"Prefix":"prism/hourly/"},"Expiration":{"Days":14}},{"ID":"daily","Status":"Enabled","Filter":{"Prefix":"prism/daily/"},"Expiration":{"Days":90}}]}'
```

**3. Let the nodes write to that bucket** (covers only `prism/` in this bucket, for every pod on those nodes)
```bash
NG=$(aws eks list-nodegroups --cluster-name $CLUSTER --region $REGION --query 'nodegroups[0]' --output text)
ROLE=$(aws eks describe-nodegroup --cluster-name $CLUSTER --nodegroup-name $NG --region $REGION --query nodegroup.nodeRole --output text | sed 's#.*/##')
cat > /tmp/prism-backup-policy.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],"Resource":"arn:aws:s3:::$BUCKET/prism/*"},
 {"Effect":"Allow","Action":["s3:ListBucket"],"Resource":"arn:aws:s3:::$BUCKET"}]}
JSON
aws iam put-role-policy --role-name "$ROLE" --policy-name prism-backup --policy-document file:///tmp/prism-backup-policy.json
```

**4. Build the backup image** (needs your Docker Hub login)
```bash
cd /Users/stephanjoseph/Documents/Proposals/Prism/damo-estimator-workflow
k8s/backup-image/build.sh 20261126-1
```

**5. Write the settings file** (git-ignored, so your account number stays out of the repo)
```bash
cp k8s/backup.local.env.example k8s/backup.local.env
printf 'S3_BUCKET=%s\nS3_PREFIX=prism\nBACKUP_IMAGE_TAG=20261126-1\n' "$BUCKET" > k8s/backup.local.env
cat k8s/backup.local.env
```

**6. Apply the schedule and run one backup now**
```bash
scripts/apply-backup.sh --test
```
The last line should be `backup ok: prism/hourly/prism-backup-... N accounts, N deals`.

**7. Check it** (also the way to check later that it keeps running)
```bash
scripts/backup-age.sh
scripts/restore-from-s3.sh --list
```
The age is a few minutes right after step 6, and below 3 hours afterwards. `LAST SCHEDULE` in `kubectl -n prism-damo get cronjob prism-backup` shows the last hourly run.

**If a step fails:** `AccessDenied` means the step 3 policy is missing or too new (wait a minute). `Unable to locate credentials` means nodes block the node role for pods and a pod-level role is needed. A `Pending` pod: `kubectl -n prism-damo describe pod -l app=prism-backup | tail -15`.

**After a cluster rebuild** `scripts/rebuild-prism.sh` restores from the bucket and re-applies the schedule (it reads `k8s/backup.local.env`). The bucket and its files survive the cluster.
