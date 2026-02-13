# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately:

### Preferred Method: GitHub Private Vulnerability Reporting

1. Go to the [Security tab](https://github.com/fbuireu/github-star-tracker/security)
2. Click "Report a vulnerability"
3. Fill in the details about the vulnerability

### Alternative: Email

Send an email to **fbuireu@gmail.com** with:

- Type of issue (e.g., token exposure, code injection, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Updates**: We'll provide updates on the fix progress
- **Timeline**: We aim to fix critical issues within 7 days
- **Credit**: We'll credit you in the security advisory (unless you prefer to remain anonymous)
- **Disclosure**: We follow a 90-day responsible disclosure policy

## Security Best Practices

When using this GitHub Action:

### 1. Token Permissions

Always use minimal token permissions:

```yaml
permissions:
  contents: write  # Only if using data-branch
  issues: write    # Only if creating issues
```

### 2. Secrets Management

Never expose tokens in logs or outputs:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}  # ✅ Good
    # github-token: ghp_xxxxx  # ❌ Never hardcode
```

### 3. Configuration Files

Avoid committing sensitive data in configuration files:

```yaml
# star-tracker.yml
reporting:
  email:
    smtp_password: ${{ secrets.SMTP_PASSWORD }}  # ✅ Use secrets
```

### 4. Regular Updates

Keep the action updated to the latest version:

```yaml
- uses: fbuireu/github-star-tracker@v1  # ✅ Auto-updates minor/patch
# - uses: fbuireu/github-star-tracker@v1.0.0  # ⚠️ Pinned, won't get security fixes
```

## Known Security Considerations

### GitHub Token Access

This action requires a GitHub token with repository access. The token is used to:
- Read repository information
- Read star counts
- Write to data branch (optional)
- Send emails (optional)

### Data Storage

If using the data-branch feature:
- Historical data is stored in a Git branch
- This data is accessible to anyone with repository access
- Do not enable this feature if your repository is public and you want to keep star data private

## Security Updates

Security updates will be released as:
- Patch versions (e.g., 1.0.1) for backward-compatible fixes
- Minor versions (e.g., 1.1.0) if changes affect functionality
- Documented in release notes with [Security] tag

Subscribe to releases to stay informed:
- Watch > Custom > Releases
- Enable security alerts in repository settings
