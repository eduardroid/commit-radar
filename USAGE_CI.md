# 🌩️ CommitRadar for GitHub Actions

> **Enterprise-grade Semantic Firewall for your CI/CD pipeline.**
> Automatically block Pull Requests that introduce logic errors or critical dependency breaks before they merge.

---

## Overview
Integrating CommitRadar into GitHub Actions ensures that **every Pull Request** is scanned for "Blast Radius" risks. Unlike the local CLI (which relies on individual developer compliance), the GitHub Action enforces quality gates at the repository level.

## 📋 Prerequisites

Before configuring the workflow, you need to store your OpenAI API Key securely.

1.  Go to your GitHub Repository.
2.  Navigate to **Settings** > **Secrets and variables** > **Actions**.
3.  Click **New repository secret**.
4.  Name: `OPENAI_API_KEY`
5.  Value: `sk-proj-...` (Your OpenAI Key)

---

## ⚙️ Configuration

Create a new file in your repository at `.github/workflows/commit-radar.yml` and paste the following configuration.

### Standard Workflow

```yaml
name: CommitRadar Guard

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main, master]

jobs:
  semantic-scan:
    name: Blast Radius Analysis
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          # ⚠️ CRITICAL: We need the full git history to calculate the diff correctly.
          # Without this, CommitRadar cannot compare the PR against the base branch.
          fetch-depth: 0

      - name: Run CommitRadar
        uses: eduardroid/commit-radar@v1
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          # Optional: Custom model (Default: gpt-4o-mini)
          openai_model: 'gpt-4o-mini'
```
---

## 🔧 Configuration Inputs

CommitRadar is highly configurable to suit different enterprise needs.

| Input | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `openai_api_key` | Your OpenAI API Secret Key. | **Yes** | N/A |
| `openai_model` | The LLM model to use for inference. We recommend `gpt-4o-mini` for speed and cost efficiency. | No | `gpt-4o-mini` |
| `openai_base_url` | Custom endpoint URL. Useful for **Azure OpenAI**, **LocalAI**, or Enterprise Proxies. | No | `https://api.openai.com/v1` |

---

## 🛡️ Security & Cost Controls

CommitRadar runs efficiently in CI environments:

1.  **Smart Diffing:** It only analyzes files changed in the Pull Request relative to the base branch.
2.  **Circuit Breakers:**
    * Skips analysis if the PR touches >15 files (assumes refactor/migration).
    * Skips individual files larger than 500 lines to prevent timeout and reduce token usage.
3.  **Fail-Safe:** If the API fails (e.g., rate limits), the Action will fail securely or warn, depending on your configuration, ensuring no silent failures.

## 🆘 Troubleshooting

**Error: `CI Git Diff failed`**
* **Cause:** The runner did not fetch the git history.
* **Fix:** Ensure `fetch-depth: 0` is present in the `actions/checkout` step.

**Error: `401 Unauthorized`**
* **Cause:** The `OPENAI_API_KEY` secret is missing or invalid.
* **Fix:** Verify the secret in Repository Settings.