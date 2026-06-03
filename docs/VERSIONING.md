# Folcen Dev Versioning And Rollback

This repo already uses Git. Use Git as the development rollback layer for the frontend app, dashboard code, and backend code. This is only for developer safety; it does not change app logic or runtime behavior.

## Current Stable Checkpoint

Create a stable tag whenever the app is known to work:

```powershell
git tag -a stable/2026-06-03-before-fixes -m "Stable before frontend dashboard backend fixes"
```

To push that checkpoint to GitHub:

```powershell
git push origin stable/2026-06-03-before-fixes
```

## Daily Fix Workflow

1. Start from the known release branch:

```powershell
git switch release/v0.9
git pull --ff-only origin release/v0.9
```

2. Create a fix branch before changing frontend, dashboard, or backend:

```powershell
git switch -c fix/<short-name>
```

3. Commit small working steps:

```powershell
git status
git add <files>
git commit -m "Fix <short description>"
```

4. If the fix is good, merge it back:

```powershell
git switch release/v0.9
git merge --no-ff fix/<short-name>
git tag -a stable/<date>-after-<short-name> -m "Stable after <short-name>"
```

## Rollback

To inspect a stable version without changing the branch:

```powershell
git switch --detach stable/2026-06-03-before-fixes
```

To return to normal development:

```powershell
git switch release/v0.9
```

To undo a bad local fix branch before it is merged:

```powershell
git switch release/v0.9
git branch -D fix/<short-name>
```

To revert a bad merged commit while keeping history:

```powershell
git revert <commit-sha>
```

## Important

- Do not commit `.env`, `.jks`, `.keystore`, APKs, or build outputs.
- Keep `android/app/folcen-release-key.jks` backed up privately. Future Android updates must use the same signing key.
- Tag every known-good deploy point before starting risky fixes.
