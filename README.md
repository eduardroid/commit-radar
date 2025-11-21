# 📡 CommitRadar

> **The Semantic Firewall for your Git workflow.**
> Catch logical bugs that Linters and Static Analysis miss.

[![npm version](https://img.shields.io/npm/v/commit-radar.svg)](https://www.npmjs.com/package/commit-radar)
[![License: UNLICENSED](https://img.shields.io/badge/License-Proprietary-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🛑 The Problem
Your Linter checks **syntax** (`missing semicolon`).
Your Tests check **expected paths** (`assert(2+2 === 4)`).
**But who checks the logic *between* files?**

If you change a variable type in `config.ts` from a `Number` to a `String`, your linter will pass, but `payment-service.ts` (which imports it) might crash in production with `NaN`.

## 🛡️ The Solution
**CommitRadar** is an AI-powered pre-commit guard. It intercepts your commit, analyzes the **dependency graph** of your changes, and predicts the "Blast Radius".

If it detects that your change breaks the logic of a dependent file, **it blocks the commit**.

---

## 🚀 Quick Start (10 Seconds)

### 1. Install
Install it as a dev dependency. The setup script will automatically configure Husky hooks for you.

```bash
npm install -D commit-radar
```

### 2. Configure API Key
CommitRadar uses OpenAI's LLM for semantic analysis. Create a `.env` file in your project root:

```bash
OPENAI_API_KEY=sk-proj-your-openai-key-here
```
Tip: We recommend using a scoped Project Key restricted to gpt-4o-mini with a budget limit.

### 3. That's it.
Try to commit a change. CommitRadar will run automatically.

```bash
git add .
git commit -m "feat: update tax logic"
```

---

## 🔒 Privacy Mode (Local LLMs / Ollama)
**Don't want to send your code to the cloud?** No problem.
CommitRadar supports local inference (Ollama, LM Studio, LocalAI) out of the box.

1. Install [Ollama](https://ollama.com/) and pull a model (e.g., `ollama pull mistral`).
2. Update your `.env`:

```env
# Point to your local instance
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=mistral
OPENAI_API_KEY=ollama  # Can be anything for local
```
Now CommitRadar runs 100% on your machine. Zero data egress.

---

## 🧠 How it Works

1.  **Interception:** Hooks into `git commit` via Husky.
2.  **Graph Analysis:** Scans your project using AST analysis (`madge`) to build a real-time dependency map.
3.  **Blast Radius Calculation:** Identifies which files import the files you modified.
4.  **AI Judgment:** Sends the *diff* and the *context of dependent files* to the LLM.
5.  **Verdict:**
    * ✅ **PASS:** Logic seems sound.
    * ❌ **BLOCK:** "Critical Risk detected: Type mismatch in `billing.ts`."

---

## ⚙️ Smart Limits (Cost Protection)
To prevent high API bills and slow commits, CommitRadar includes built-in **Circuit Breakers**:

* **Massive Commits:** If you stage >10 files, analysis is skipped (assumes migration/refactor).
* **Huge Files:** Files >400 lines are skipped to save tokens and reduce latency.
* **Supported Extensions:** Only analyzes `.js`, `.ts`, `.jsx`, `.tsx`.

---

## 🔒 Privacy & Security

* **Local First:** Use Ollama/LocalAI to keep 100% of your code on your machine.
* **Zero-Retention (Cloud):** If you use OpenAI, we use the API (not ChatGPT), which does not train on your data by default.
* **Minimal Context:** We only analyze the *diff* and direct dependents. We never scan your entire repo.

---

## 📝 License

Copyright © 2025. All rights reserved.
This software is provided "as is" for personal and commercial use as a dependency, but redistribution of the source code is restricted.