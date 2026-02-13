# Releasing Guide

This guide explains how to create new releases for GitHub Star Tracker.

## Version Management

The project version is managed in `package.json` and uses **semantic versioning**:

- **Major** (x.0.0): Breaking changes
- **Minor** (1.x.0): New features, backward compatible
- **Patch** (1.0.x): Bug fixes, backward compatible

## Release Process

### Step 1: Prepare Changes

Ensure all changes are committed and pushed:

```bash
git status  # Should be clean
pnpm run validate  # All tests pass
```

### Step 2: Update Version

Use npm version to update `package.json`, create commit, and create git tag:

```bash
# For bug fixes
npm version patch
# Example: 1.0.4 → 1.0.5

# For new features
npm version minor
# Example: 1.0.4 → 1.1.0

# For breaking changes
npm version major
# Example: 1.0.4 → 2.0.0
```

This command:
- ✅ Updates `package.json` version
- ✅ Creates a git commit: `1.0.5`
- ✅ Creates a git tag: `v1.0.5`
- ✅ Runs pre/post version scripts (if defined)

### Step 3: Push Changes

Push both the commit and the tag:

```bash
git push --follow-tags
```

Or separately:

```bash
git push
git push --tags
```

### Step 4: Automated Release

Once the tag is pushed, the GitHub Actions workflow automatically:

1. ✅ Validates the code (lint, typecheck, tests)
2. ✅ Builds the action
3. ✅ Generates changelog
4. ✅ Creates GitHub release
5. ✅ Updates `v1` and `v1.0` tags (major/minor pointers)

**Monitor the workflow:**
- Go to: https://github.com/fbuireu/github-star-tracker/actions
- Check the "Release" workflow run

### Step 5: Verify Release

After the workflow completes:

```bash
# Check release was created
gh release view v1.0.5

# Verify tags
git fetch --tags --force
git log --oneline v1 -1
git log --oneline v1.0 -1
git log --oneline v1.0.5 -1
# All should point to the same commit
```

---

## Quick Reference

### Patch Release (Bug Fixes)

```bash
npm version patch
git push --follow-tags
```

### Minor Release (New Features)

```bash
npm version minor
git push --follow-tags
```

### Major Release (Breaking Changes)

```bash
npm version major
git push --follow-tags
```

---

## Manual Process (Not Recommended)

If you need to manually create a release:

1. Update `package.json` version manually
2. Commit: `git commit -am "chore: bump version to 1.0.5"`
3. Create tag: `git tag v1.0.5`
4. Push: `git push --follow-tags`

---

## Version Tags

The project maintains multiple version tags:

- **`v1.0.5`** — Specific patch version (static)
- **`v1.0`** — Latest patch in 1.0.x series (updated automatically)
- **`v1`** — Latest minor in 1.x.x series (updated automatically)

**Users should reference:**
```yaml
uses: fbuireu/github-star-tracker@v1  # Recommended
```

This ensures they get the latest compatible version.

---

## Troubleshooting

### Tag Already Exists

If you accidentally create the wrong version:

```bash
# Delete local tag
git tag -d v1.0.5

# Delete remote tag
git push origin :refs/tags/v1.0.5

# Fix package.json version
npm version 1.0.5 --no-git-tag-version

# Create correct tag
git tag v1.0.5
git push --tags
```

### Release Workflow Failed

If the GitHub Actions workflow fails:

1. Check the error in Actions tab
2. Fix the issue (usually validation errors)
3. Force push the tag to re-trigger:
   ```bash
   git push --tags --force
   ```

### Version Mismatch

If `package.json` and tags are out of sync:

```bash
# Check current tag
git describe --tags

# Update package.json to match
npm version 1.0.4 --no-git-tag-version

# Commit
git commit -am "chore: sync version to tags"
git push
```

---

## Pre-release Versions

For testing before stable release:

```bash
# Create pre-release
npm version prerelease --preid=beta
# Example: 1.0.4 → 1.0.5-beta.0

git push --follow-tags

# Users can test with:
# uses: fbuireu/github-star-tracker@v1.0.5-beta.0
```

---

## Changelog

Changelogs are **automatically generated** by the release workflow using git commits between tags.

**Best practices:**
- Use conventional commits (feat:, fix:, docs:, etc.)
- Write clear commit messages
- One logical change per commit

**Example commits:**
```bash
git commit -m "feat: add support for fine-grained tokens"
git commit -m "fix: resolve chart rendering in emails"
git commit -m "docs: update wiki with PAT guide"
```

---

## Related Documentation

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [npm version docs](https://docs.npmjs.com/cli/v10/commands/npm-version)
