---
name: publishtokennow
description: >
  Project release and auto-publish skill for Agent Space Manager.
  Bumps the plugin version across package.json, page/index.html, and CHANGELOG.md,
  verifies tests and npm packaging, and pushes a v* git tag to trigger the GitHub Actions
  workflow that publishes to the Magpie Plugin Marketplace (npm).
  Activate when the user types /publishtokennow or mentions "publishtokennow" with a version (e.g. V1.2.0).
---

# Publish Token Now (`publishtokennow`)

Automates releasing a new version of **Agent Space Manager** to the **Magpie Plugin Marketplace** (npm) via GitHub Actions.

---

## 1. Parse Target Version

- Extract the requested version from the user prompt (e.g. `V1.2.0`, `v1.2.0`, or `1.2.0`).
- Normalize into:
  - `SEMVER`: `1.2.0` (no `v` prefix)
  - `DISPLAY_VERSION`: `V1.2.0` (uppercase `V`)
  - `GIT_TAG`: `v1.2.0` (lowercase `v`)
- If no version is specified, ask the user which semver version to release before editing files.

---

## 2. Update Version & Changelog

1. **`package.json`**:
   - Update `"version": "<SEMVER>"`.
2. **`index.mjs`**:
   - Ensure `AgentSpaceManagerPlugin.version` is set to `"<SEMVER>"`.
3. **`page/index.html`**:
   - Update `<span class="plugin-version-badge" id="pluginVersionBadge">V...</span>` to `DISPLAY_VERSION` (`V<SEMVER>`).
4. **`CHANGELOG.md`**:
   - Inspect recent changes since the last tag (`git log -n 20 --oneline` or `git diff`) to summarize what changed.
   - Prepend a new release section right above the previous release entry using Keep a Changelog format:
     ```markdown
     ## [<SEMVER>] - <YYYY-MM-DD>

     ### Added / Changed / Fixed
     - <Concise summary of actual changes in this release>
     ```
   - Preserve all prior version sections and the `# Prompt Text Changelog` section intact.

---

## 3. Pre-Publish Verification

Run the sandboxed test suite and packaging dry-run before committing:

```powershell
$env:ASM_TEST="1"; $env:NODE_ENV="test"; rtk npm test
rtk npm pack --dry-run
```

If any test fails, **stop** and report the failure before tagging or pushing.

---

## 4. Commit, Tag & Trigger GitHub Actions Publish

1. Stage and commit the release files:
   ```bash
   git add package.json index.mjs page/index.html CHANGELOG.md
   git commit -m "chore(release): v<SEMVER>"
   ```
2. Create or update the annotated tag and push both branch and tag to `origin`:
   ```bash
   git tag -f -a v<SEMVER> -m "Release v<SEMVER>"
   # Invariant: Verify HEAD has the tag before pushing
   git tag --points-at HEAD
   git push origin HEAD
   git push -f origin v<SEMVER>
   ```
3. Pushing `v<SEMVER>` automatically triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml), which runs `npm test` and executes `npm publish --access public` using `secrets.NPM_TOKEN`.
4. If `gh` CLI is available, check the triggered workflow run:
   ```bash
   gh run list --workflow=publish.yml --limit 3
   ```
   Report the tag, commit SHA, and GitHub Actions workflow status to the user.

