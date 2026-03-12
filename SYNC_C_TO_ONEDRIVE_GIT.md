# Sync Workflow: `C:\Scheduling` -> OneDrive Git Repo

Use this when you develop in `C:\Scheduling` but your tracked Git repo is in:

`C:\Users\rodrigs\OneDrive - AMDOCS\Documents\GitHub\niikskate`

---

## 1) Verify source and destination

- Source (latest local edits): `C:\Scheduling`
- Destination (Git-tracked repo): `C:\Users\rodrigs\OneDrive - AMDOCS\Documents\GitHub\niikskate`

Make sure both folders exist before syncing.

---

## 2) Sync files with one command (no manual copy/paste)

Run in PowerShell:

```powershell
$src = "C:\Scheduling"
$dst = "C:\Users\rodrigs\OneDrive - AMDOCS\Documents\GitHub\niikskate"

robocopy "$src" "$dst" /E /R:1 /W:1 `
  /XD ".git" "node_modules" ".nuxt" ".output" ".vercel" `
  /XF ".env"
```

What this does:
- Copies all project files recursively
- Skips heavy/generated folders
- Keeps destination Git history intact (`.git` excluded)
- Avoids leaking local secrets (`.env` excluded)

---

## 3) Commit and push from GitHub Desktop

1. Open repo: `niikskate`
2. Go to **Changes**
3. Add commit message
4. **Commit to main** (or your branch)
5. **Push origin**

---

## 4) Verify deployment (Vercel)

If Vercel is connected to this repo:
- push triggers auto-deploy
- check latest deployment status in Vercel dashboard

---

## Optional: safer preview before copy

To preview what would change, add `/L` (list only):

```powershell
robocopy "$src" "$dst" /E /L /R:1 /W:1 `
  /XD ".git" "node_modules" ".nuxt" ".output" ".vercel" `
  /XF ".env"
```

Remove `/L` to execute the real sync.

---

## Recommended long-term setup

To avoid this extra sync step, work directly in the Git repo folder:

`C:\Users\rodrigs\OneDrive - AMDOCS\Documents\GitHub\niikskate`
