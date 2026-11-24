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

**2. Put the newest backup where the script looks.**
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

- **Back up** after you add or remove people, after a role change, and weekly otherwise: `scripts/backup-data.sh ~/prism-backups/prism-backup-<date>.tgz` (the folder must exist). The backup holds password hashes: keep it private, never commit it.
- **Keep the disk** if the volume claim is ever deleted: `kubectl patch pv <name> -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'` (find the name with `kubectl get pv`).
- **Back up the Library separately.** It is on its own volume.

See the README section "Backup, restore and rebuilding from scratch" for the manual version of these steps, and `scripts/rebuild-prism.sh --help` for the options. The rebuild script has not been run against a real cluster yet. Try it once in a sandbox you can afford to delete.
