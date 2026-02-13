# Personal Access Token (PAT) Guide

Complete guide to creating and managing Personal Access Tokens for GitHub Star Tracker.

## 📋 Overview

GitHub Star Tracker requires a **Personal Access Token (PAT)** to list your repositories. The default `GITHUB_TOKEN` provided by GitHub Actions has restricted permissions and cannot list all your repositories.

### Why PAT is Required

| Token Type       | Can List User Repos? | Can List Private Repos?    | Reason                         |
| ---------------- | -------------------- | -------------------------- | ------------------------------ |
| `GITHUB_TOKEN`   | ❌ No                | ❌ No                      | Limited to workflow repository |
| PAT (Classic)    | ✅ Yes               | ✅ Yes (with `repo` scope) | Full user permissions          |
| Fine-grained PAT | ✅ Yes               | ✅ Yes (with permissions)  | Granular control               |

---

## 🔑 Option 1: Classic Personal Access Token (Recommended)

Classic tokens are simpler and have proven reliability.

### Step-by-Step Creation

#### 1. Navigate to Token Settings

1. Go to GitHub and click your profile picture (top right)
2. Select **Settings**
3. Scroll down to **Developer settings** (bottom of left sidebar)
4. Click **Personal access tokens**
5. Click **Tokens (classic)**

**Direct link:** [github.com/settings/tokens](https://github.com/settings/tokens)

#### 2. Generate New Token

1. Click **Generate new token** → **Generate new token (classic)**
2. You may be prompted to confirm your password or 2FA

#### 3. Configure Token

**Note (required):**

```
GitHub Star Tracker
```

**Expiration (choose one):**

- `30 days` — More secure, needs renewal monthly
- `90 days` — Balanced security and convenience
- `No expiration` — Convenient but less secure (not recommended)
- `Custom` — Set your own date

> 💡 **Recommendation:** Use `90 days` and set a calendar reminder to renew.

**Select scopes:**

For **public repositories only:**

- ✅ `public_repo` — Access public repositories

For **public AND private repositories:**

- ✅ `repo` — Full control of private repositories
  - This automatically includes all sub-scopes:
    - `repo:status`
    - `repo_deployment`
    - `public_repo`
    - `repo:invite`
    - `security_events`

> ⚠️ **Security:** If you only need public repos, use `public_repo` to minimize permissions.

**DO NOT select:**

- ❌ `admin:org`
- ❌ `delete_repo`
- ❌ `workflow`
- ❌ Any other scopes

#### 4. Generate and Copy

1. Scroll to bottom and click **Generate token**
2. **IMMEDIATELY copy the token** (starts with `ghp_`)
3. **Store it securely** — you won't be able to see it again
4. If you lose it, you'll need to regenerate

#### 5. Add to Repository Secrets

1. Go to your repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. **Name:** `STAR_TRACKER_TOKEN`
5. **Value:** Paste your token
6. Click **Add secret**

---

## 🔐 Option 2: Fine-Grained Personal Access Token

Fine-grained tokens provide more granular control and are considered more secure.

### Advantages

- ✅ Repository-specific permissions
- ✅ Time-limited automatically
- ✅ Better audit trail
- ✅ Least-privilege principle

### Disadvantages

- ⚠️ More complex setup
- ⚠️ May require organization approval
- ⚠️ Currently in beta

### Step-by-Step Creation

#### 1. Navigate to Token Settings

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Fine-grained tokens** tab
3. Click **Generate new token**

#### 2. Configure Token Basics

**Token name (required):**

```
GitHub Star Tracker
```

**Description (optional):**

```
Automated star tracking for all my repositories
```

**Expiration (required):**

- Choose between 7 days and 1 year
- Maximum: 90 days (default)

> 📝 **Note:** Fine-grained tokens MUST have an expiration date.

**Resource owner:**

- Select your username (not organization, unless needed)

#### 3. Repository Access

Choose repository access level:

**Option A: All Repositories (Recommended)**

- Select **All repositories**
- Simplest for tracking all repos
- Automatically includes future repos

**Option B: Specific Repositories**

- Select **Only select repositories**
- Choose repositories to track
- Requires manual updates when adding repos
- More secure but less convenient

**Option C: Public Repositories Only**

- Select **Public Repositories (read-only)**
- Cannot track private repositories
- Most secure option

#### 4. Permissions

Expand **Repository permissions** and configure:

**Required Permissions:**

| Permission   | Access Level | Reason                                              |
| ------------ | ------------ | --------------------------------------------------- |
| **Metadata** | Read         | Access repository list and metadata (auto-selected) |

**DO NOT grant:**

- ❌ Contents
- ❌ Actions
- ❌ Administration
- ❌ Any other permissions

> 💡 **Security Note:** Metadata permission is automatically selected and sufficient for star tracking.

#### 5. Generate and Copy

1. Scroll to bottom
2. Click **Generate token**
3. **IMMEDIATELY copy the token** (starts with `github_pat_`)
4. Store securely
5. Add to repository secrets (same as classic token)

---

## 🔄 Token Comparison

| Feature                   | Classic PAT  | Fine-Grained PAT  |
| ------------------------- | ------------ | ----------------- |
| **Setup complexity**      | ⭐ Simple    | ⭐⭐⭐ Complex    |
| **Expiration options**    | Optional     | Required          |
| **Scope granularity**     | Coarse       | Fine-grained      |
| **Repository-specific**   | No           | Yes               |
| **Organization approval** | Not required | May be required   |
| **Audit logs**            | Basic        | Detailed          |
| **Best for**              | Personal use | Team environments |

---

## 🛡️ Security Best Practices

### 1. Use Minimum Permissions

**For public repos only:**

```
Classic: public_repo
Fine-grained: All repositories + Metadata (read)
```

**For private repos:**

```
Classic: repo
Fine-grained: All repositories + Metadata (read)
```

### 2. Set Expiration

- ✅ Use 90 days or less
- ✅ Set calendar reminder for renewal
- ❌ Avoid "No expiration" unless absolutely necessary

### 3. Store Securely

- ✅ Use GitHub Secrets (encrypted)
- ✅ Use password manager for backup
- ❌ Never commit to repository
- ❌ Don't share in chat/email
- ❌ Don't store in plain text files

### 4. Rotate Regularly

- ✅ Regenerate every 90 days
- ✅ Delete old tokens after creating new ones
- ✅ Update secrets in GitHub Actions

### 5. Monitor Usage

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Check **Last used** column
3. Revoke unused tokens
4. Review audit logs periodically

---

## 🔧 Token Management

### Checking Token Status

#### Via GitHub UI

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Find your token in the list
3. Check:
   - **Last used:** When token was used
   - **Expires:** Expiration date
   - **Scopes:** Granted permissions

#### Via API

```bash
# Test if token is valid
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/user

# Check scopes
curl -I -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/user \
  | grep x-oauth-scopes
```

### Regenerating Token

**When to regenerate:**

- Token expired
- Token compromised
- Changing permissions
- Security best practice (every 90 days)

**Steps:**

1. Go to token settings
2. Click **Regenerate token** (classic) or **Regenerate** (fine-grained)
3. Copy new token immediately
4. Update repository secrets
5. Test action workflow

### Revoking Token

**When to revoke:**

- Token compromised
- No longer needed
- Replacing with new token

**Steps:**

1. Go to token settings
2. Click **Delete** (classic) or **Revoke** (fine-grained)
3. Confirm deletion
4. Token stops working immediately

> ⚠️ **Warning:** Workflows using revoked token will fail immediately.

---

## 🐛 Troubleshooting

### Error: "Bad credentials"

**Symptoms:**

```
Error: Bad credentials
```

**Causes:**

- Token is expired
- Token is revoked
- Token is incorrect
- Secret name mismatch

**Solutions:**

1. Verify token in [settings/tokens](https://github.com/settings/tokens)
2. Check expiration date
3. Regenerate token if expired
4. Verify secret name is `STAR_TRACKER_TOKEN`
5. Verify secret value has no extra spaces

### Error: "Resource not accessible by integration"

**Symptoms:**

```
Error: Resource not accessible by integration
```

**Causes:**

- Using `GITHUB_TOKEN` instead of PAT
- Missing required scopes
- Organization policies blocking access

**Solutions:**

1. Verify using PAT, not `GITHUB_TOKEN`
2. Classic: ensure `repo` or `public_repo` scope
3. Fine-grained: ensure **Metadata** permission
4. Check organization settings if applicable

### Error: "Not Found" for Private Repos

**Symptoms:**

```
Error: Not Found
API: 404 Not Found
```

**Causes:**

- Using `public_repo` scope with private repos
- Fine-grained token doesn't include repository
- Repository access revoked

**Solutions:**

1. Classic: use `repo` scope instead of `public_repo`
2. Fine-grained: select "All repositories" or add specific repos
3. Verify repository exists and you have access

### Token Expired

**Symptoms:**

```
Error: 401 Unauthorized
```

**Solutions:**

1. Go to [settings/tokens](https://github.com/settings/tokens)
2. Regenerate expired token
3. Update `STAR_TRACKER_TOKEN` secret
4. Re-run workflow

### Token Not Found in Secrets

**Symptoms:**

```
Input required and not supplied: github-token
```

**Causes:**

- Secret not created
- Secret name mismatch
- Secret in wrong repository

**Solutions:**

1. Verify secret exists: **Settings → Secrets → Actions**
2. Verify secret name: `STAR_TRACKER_TOKEN`
3. Verify you're in correct repository
4. Create secret if missing

---

## 📊 Token Scopes Reference

### Classic Token Scopes

| Scope             | Access                        | Needed for Star Tracker?       |
| ----------------- | ----------------------------- | ------------------------------ |
| `repo`            | Full control of private repos | ✅ Yes (for private repos)     |
| `public_repo`     | Access public repos           | ✅ Yes (for public repos only) |
| `admin:org`       | Full organization access      | ❌ No                          |
| `workflow`        | Update workflows              | ❌ No                          |
| `delete_repo`     | Delete repositories           | ❌ No                          |
| `admin:repo_hook` | Repository webhooks           | ❌ No                          |

### Fine-Grained Permissions

| Permission     | Access     | Needed for Star Tracker? |
| -------------- | ---------- | ------------------------ |
| **Metadata**   | Read       | ✅ Yes (auto-selected)   |
| Contents       | Read/Write | ❌ No                    |
| Actions        | Read/Write | ❌ No                    |
| Administration | Read/Write | ❌ No                    |
| Deployments    | Read/Write | ❌ No                    |

---

## 🔗 Official Documentation

- **Classic PAT:** [docs.github.com/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- **Fine-grained PAT:** [docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)
- **Token security:** [docs.github.com/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)

---

## 📱 Organization Considerations

### Personal Repositories

- Use personal PAT
- No approval required
- Full control

### Organization Repositories

- May require organization approval for fine-grained tokens
- Check with organization admins
- Consider using classic token if approval is difficult

### SSO-Enabled Organizations

If your organization uses SAML SSO:

1. Create token
2. Click **Configure SSO**
3. Authorize for organization
4. Token works with org repos

---

## Next Steps

- **[Getting Started](Getting-Started)** — Use your token in workflows
- **[Troubleshooting](Troubleshooting)** — Common token issues
- **[Security](https://github.com/fbuireu/github-star-tracker/security/policy)** — Report security issues
