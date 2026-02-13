# Contributing to GitHub Star Tracker

First off, thank you for considering contributing to GitHub Star Tracker! It's people like you that make this action a great tool for the community.

## Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inclusive environment. By participating, you are expected to uphold this code:

- **Be respectful** — Different viewpoints and experiences are valuable
- **Be constructive** — Focus on what is best for the community
- **Be collaborative** — Work together towards common goals
- **Be patient** — Remember that we all have different levels of experience

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include as many details as possible:

- **Use the bug report template** — It's there to help you provide all necessary information
- **Describe the issue** — A clear and concise description
- **Steps to reproduce** — How can we see the bug ourselves?
- **Expected behavior** — What should happen?
- **Actual behavior** — What actually happens?
- **Environment** — OS, Node version, action version
- **Logs** — GitHub Actions workflow logs if applicable

### Suggesting Features

Feature requests are welcome! To suggest a feature:

- **Use the feature request template** — Helps structure your proposal
- **Describe the feature** — What should it do?
- **Use cases** — Why is this feature valuable?
- **Alternatives** — Have you considered other approaches?
- **Implementation ideas** — Do you have thoughts on how to build it?

### Improving Documentation

Found a typo? Something unclear? Documentation improvements are always welcome:

- README updates
- Wiki improvements
- Code comments
- Examples and tutorials

## Development Process

### Getting Started

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then:
   git clone https://github.com/YOUR_USERNAME/github-star-tracker.git
   cd github-star-tracker
   ```

2. **Install dependencies**
   ```bash
   # Requires Node.js 24+ and pnpm
   pnpm install
   ```

3. **Create a branch**
   ```bash
   git checkout -b feature/my-awesome-feature
   # Or: fix/issue-123
   # Or: docs/improve-readme
   ```

### Development Workflow

1. **Make your changes**
   ```bash
   # Edit files using your favorite editor
   ```

2. **Run tests**
   ```bash
   # Run all checks
   pnpm run validate
   
   # Or individually:
   pnpm run test          # Unit tests
   pnpm run typecheck     # Type checking
   pnpm run check         # Linting + formatting
   ```

3. **Test your changes locally**
   ```bash
   # Build the action
   pnpm run build
   
   # Test in a real workflow (create .github/workflows/test.yml)
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add support for custom data branch names"
   ```

### Code Style

We use **Biome** for linting and formatting:

```bash
# Check code style
pnpm run check

# Auto-fix issues
pnpm run format
```

**Guidelines:**
- TypeScript with strict mode
- Functional programming style preferred
- No `any` types (use `unknown` if needed)
- Functions with 3+ parameters should use object parameters
- Constants for magic numbers/strings
- Comprehensive JSDoc for public APIs

### Testing

All features should include tests:

```typescript
// src/feature.test.ts
import { describe, it, expect } from 'vitest';
import { myFeature } from './feature';

describe('myFeature', () => {
  it('should do something correctly', () => {
    const result = myFeature({ input: 'test' });
    expect(result).toBe('expected');
  });
});
```

**Test requirements:**
- ✅ Unit tests for all functions
- ✅ Integration tests for complex flows
- ✅ Minimum 80% code coverage
- ✅ Tests must pass before merging

Run tests:
```bash
pnpm run test              # Run once
pnpm run test:watch        # Watch mode
pnpm run test:coverage     # With coverage report
```

---

## Commit Message Guidelines

This project uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning and releases. **Following these commit conventions is mandatory.**

### Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Version Bump | Example |
|------|-------------|--------------|---------|
| `feat` | New feature | Minor (1.0.0 → 1.1.0) | `feat: add email notification support` |
| `fix` | Bug fix | Patch (1.0.0 → 1.0.1) | `fix: resolve chart rendering in emails` |
| `docs` | Documentation only | None | `docs: update installation guide` |
| `style` | Code style/formatting | None | `style: fix indentation` |
| `refactor` | Code restructuring | None | `refactor: simplify chart generation` |
| `perf` | Performance improvement | Patch | `perf: optimize star fetching` |
| `test` | Adding/updating tests | None | `test: add email tests` |
| `chore` | Maintenance tasks | None | `chore: update dependencies` |
| `ci` | CI/CD changes | None | `ci: add release workflow` |
| `build` | Build system changes | None | `build: update esbuild config` |
| `revert` | Revert previous commit | Depends | `revert: feat: add feature X` |

### Breaking Changes

For breaking changes, use `!` or `BREAKING CHANGE:` footer:

```bash
# Option 1: ! after type
git commit -m "feat!: change configuration structure"

# Option 2: Footer
git commit -m "feat: redesign API

BREAKING CHANGE: Config file now uses YAML instead of JSON.
Users must migrate their configuration files."
```

**Result:** Major version bump (1.0.0 → 2.0.0)

### Commit Examples

**Good commits:**
```bash
feat(charts): add comparison chart for top repositories
fix(email): resolve SMTP authentication with Gmail
docs: add troubleshooting guide to wiki
perf(api): reduce GitHub API calls by 50%
test(tracking): add integration tests for star tracking
chore(deps): update @actions/core to v1.11.1
```

**Bad commits:**
```bash
update stuff                    # ❌ Not descriptive
Fix bug                         # ❌ Doesn't follow format
added new feature               # ❌ Wrong tense (use imperative)
feat add charts                 # ❌ Missing colon
WIP                             # ❌ Not descriptive at all
```

### Commit Scope (Optional)

Scope provides additional context:

```bash
feat(charts): add new chart type
fix(email): resolve rendering issue
docs(wiki): add PAT setup guide
test(tracking): add edge case tests
```

**Common scopes:**
- `charts` — Chart generation
- `email` — Email notifications
- `tracking` — Star tracking logic
- `config` — Configuration handling
- `i18n` — Internationalization
- `data` — Data management

### Multi-line Commits

For complex changes:

```bash
git commit -m "feat(charts): add interactive charts with drill-down

- Added click handlers for chart elements
- Implemented tooltip with repository details
- Added chart legend customization
- Updated documentation with examples

Closes #123"
```

### Automated Releases

When you merge to `main`:
1. semantic-release analyzes commits since last release
2. Determines version bump based on commit types
3. Updates `package.json` automatically
4. Generates `CHANGELOG.md` from commits
5. Creates git tag and GitHub release
6. Updates `v1` major version tag

**No manual versioning needed!**

---

## Pull Request Process

### Before Submitting

1. ✅ **All tests pass** — `pnpm run validate` succeeds
2. ✅ **Code is formatted** — Run `pnpm run format`
3. ✅ **Types are correct** — No TypeScript errors
4. ✅ **Documentation updated** — If adding features
5. ✅ **Commits follow conventions** — See above
6. ✅ **Branch is up to date** — Rebase on `main` if needed

### Creating a Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/my-awesome-feature
   ```

2. **Open PR on GitHub**
   - Click "Compare & pull request"
   - Fill in the PR template
   - Link related issues

3. **PR Title Format**
   Follow commit conventions:
   ```
   feat: add support for custom branch names
   fix: resolve email delivery issue
   docs: improve setup documentation
   ```

4. **Description**
   - What does this PR do?
   - Why is this change needed?
   - How has it been tested?
   - Screenshots/examples if applicable

### Review Process

- **Maintainers will review** your PR
- **Address feedback** — Make requested changes
- **Keep discussions respectful** — We're all learning
- **Be patient** — Reviews may take a few days

### After Approval

- PR will be **merged to main**
- **Automated release** will trigger if applicable
- Your contribution will be in the next version!

---

## Project Structure

```
github-star-tracker/
├── .github/
│   ├── workflows/        # CI/CD workflows
│   └── ISSUE_TEMPLATE/   # Issue templates
├── src/
│   ├── config.ts         # Configuration handling
│   ├── index.ts          # Main entry point
│   ├── types.ts          # TypeScript types
│   ├── tracking/         # Star tracking logic
│   ├── reporting/        # Report generation
│   ├── i18n/             # Internationalization
│   └── data/             # Data management
├── wiki/                 # Wiki documentation
├── tests/                # Test files (*.test.ts)
├── action.yml            # GitHub Action metadata
├── package.json          # Dependencies
└── tsconfig.json         # TypeScript config
```

## Development Tips

### Testing Your Action Locally

Create a test workflow:

```yaml
# .github/workflows/test-local.yml
name: Test Local Changes
on: workflow_dispatch

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./  # Uses local action code
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

### Debugging

```typescript
// Use console.log for debugging (captured in workflow logs)
console.log('Debug info:', { variable, state });

// Use @actions/core for action logs
import * as core from '@actions/core';
core.debug('Detailed debug info');
core.info('General information');
core.warning('Warning message');
core.error('Error message');
```

### Common Issues

**Tests failing?**
```bash
# Clear cache and retry
rm -rf node_modules
pnpm install
pnpm run validate
```

**TypeScript errors?**
```bash
# Check types
pnpm run typecheck

# Ensure dependencies are current
pnpm install
```

**Formatting issues?**
```bash
# Auto-fix all formatting
pnpm run format
```

---

## Recognition

Contributors will be recognized in:
- Release notes (via semantic-release)
- GitHub contributors page
- Project README (for significant contributions)

## Questions?

- 💬 **Discussions** — [GitHub Discussions](https://github.com/fbuireu/github-star-tracker/discussions)
- 📖 **Documentation** — [Wiki](https://github.com/fbuireu/github-star-tracker/wiki)
- 🐛 **Issues** — [GitHub Issues](https://github.com/fbuireu/github-star-tracker/issues)

## Resources

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

Thank you for contributing! 🎉
