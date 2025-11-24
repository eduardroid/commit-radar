#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const madge = require('madge');
const { OpenAI } = require('openai');

// --- NUEVAS DEPENDENCIAS PARA GITHUB ACTIONS ---
const core = require('@actions/core');
const github = require('@actions/github');

// --- 1. CONFIG & SECURITY ---

const envPath = path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

// Hybrid Configuration (Local + CI)
// Usamos core.getInput para leer inputs de action.yml, fallback a variables de entorno
const apiKey = core.getInput('openai_api_key') || process.env.OPENAI_API_KEY || process.env.INPUT_OPENAI_API_KEY || 'ollama';
const baseURL = core.getInput('openai_base_url') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const modelName = core.getInput('openai_model') || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN; // Token para comentar

// Validate API Key only if using official OpenAI endpoint
if (baseURL.includes('openai.com') && (!apiKey || apiKey === 'ollama')) {
    console.error("❌ CRITICAL ERROR: OPENAI_API_KEY not found.");
    process.exit(1);
}

const openai = new OpenAI({ 
    apiKey: apiKey,
    baseURL: baseURL
});

// --- 2. BUSINESS RULES ---
const MAX_FILES_ALLOWED = 15;
const MAX_LINES_ALLOWED = 500;

// --- 3. UTILS ---

function getChangedFiles() {
    // A) GITHUB ACTIONS MODE
    if (process.env.GITHUB_ACTIONS) {
        console.log("☁️  Environment: GitHub Actions (CI)");
        try {
            const baseBranch = process.env.GITHUB_BASE_REF || 'main';
            console.log(`   Comparing HEAD against origin/${baseBranch}...`);
            const cmd = `git diff --name-only origin/${baseBranch}...HEAD`;
            const output = execSync(cmd, { encoding: 'utf8' });
            return output.split('\n').filter(line => line.trim() !== '');
        } catch (e) {
            console.error("⚠️  CI Git Diff failed. HINT: Use 'fetch-depth: 0' in checkout.");
            return []; 
        }
    }
    // B) LOCAL MODE
    console.log("💻 Environment: Local (Husky/Staging)");
    try {
        const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
        return output.split('\n').filter(line => line.trim() !== '');
    } catch (e) { return []; }
}

function isFileTooBig(filePath) {
    try {
        if (!fs.existsSync(filePath)) return true;
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').length;
        if (lines > MAX_LINES_ALLOWED) {
            console.log(`⚠️  Skipping ${path.basename(filePath)}: Too large.`);
            return true;
        }
        return false;
    } catch (e) { return true; }
}

// --- 4. MAIN LOGIC ---

async function analyze() {
    console.log(`🔌 Provider: ${baseURL.includes('openai.com') ? 'OpenAI' : 'Local'}`);
    console.log(`🤖 Model: ${modelName}`);
    console.log("🕵️  CommitRadar: Scanning...");

    const changedFiles = getChangedFiles();
    const codeFiles = changedFiles.filter(f => /\.(js|ts|jsx|tsx)$/.test(f));

    if (codeFiles.length === 0) {
        console.log("✅ No logical code changes detected.");
        process.exit(0);
    }

    if (codeFiles.length > MAX_FILES_ALLOWED) {
        console.log(`⚠️  Massive change (${codeFiles.length} files). Skipping AI analysis.`);
        process.exit(0);
    }

    console.log(`🧠 Building dependency graph...`);
    let tree = {};
    try {
        const res = await madge('.', { fileExtensions: ['js', 'ts', 'jsx', 'tsx'], excludeRegExp: [/^node_modules/, /^\.git/] });
        tree = res.obj();
    } catch (e) {
        process.exit(0);
    }

    let riskDetected = false;
    
    // --- OCTOKIT: Inicializamos el reporte Markdown ---
    let reportMarkdown = "### 🛡️ CommitRadar Security Report\n\n";
    reportMarkdown += "**The following changes have been flagged as risky:**\n\n";

    for (const file of codeFiles) {
        if (isFileTooBig(file)) continue;

        const fileNameBase = path.basename(file, path.extname(file));
        const impacted = [];
        Object.keys(tree).forEach(importer => {
            if (tree[importer].some(dep => dep.includes(fileNameBase))) impacted.push(importer);
        });

        if (impacted.length === 0) continue;
        const safeImpacted = impacted.filter(imp => !isFileTooBig(imp)).slice(0, 2);
        if (safeImpacted.length === 0) continue;

        console.log(`⚡ Analyzing '${file}' -> [${safeImpacted.join(', ')}]`);

        const sourceCode = fs.readFileSync(file, 'utf8');
        let prompt = `You are a strict CI/CD Guardian. Goal: Detect broken logic/types.\n\n`;
        prompt += `--- MODIFIED: ${file} ---\n${sourceCode}\n\n`;
        safeImpacted.forEach(imp => {
            prompt += `--- DEPENDENT: ${imp} ---\n${fs.readFileSync(imp, 'utf8')}\n\n`;
        });
        prompt += `Respond JSON: { "verdict": "APPROVED"|"REJECTED", "risk": "LOW"|"CRITICAL", "reason": "1 sentence explanation" }`;

        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: modelName,
                response_format: { type: "json_object" },
                temperature: 0
            });

            const result = JSON.parse(completion.choices[0].message.content);
            
            if (result.verdict === "REJECTED" || result.risk === "CRITICAL") {
                riskDetected = true;
                const reason = result.reason;

                console.log(`❌ RISK in ${file}: ${reason}`);
                
                // --- OCTOKIT: Acumulamos el error en el reporte ---
                reportMarkdown += `#### 🔴 Critical Risk in \`${file}\`\n`;
                reportMarkdown += `> ${reason}\n\n`;
                reportMarkdown += `**Impacts:** \`${safeImpacted.join(', ')}\`\n`;
                reportMarkdown += `---\n`;
            } else {
                console.log(`✅ APPROVED: ${file}`);
            }

        } catch (error) {
            console.error("⚠️ AI Analysis failed:", error.message);
        }
    }

    if (riskDetected) {
        console.error("\n❌ AUTOMATIC BLOCK: Critical risks detected.");

        // --- OCTOKIT: Publicar comentario si estamos en GitHub Actions ---
        if (process.env.GITHUB_ACTIONS && githubToken) {
            console.log("💬 Posting comment to Pull Request...");
            try {
                const octokit = github.getOctokit(githubToken);
                const context = github.context;

                // Solo comentamos si es un PR real
                if (context.payload.pull_request) {
                    await octokit.rest.issues.createComment({
                        ...context.repo,
                        issue_number: context.payload.pull_request.number,
                        body: reportMarkdown
                    });
                    console.log("✅ Comment posted successfully.");
                } else {
                    console.log("ℹ️ Not a PR event, skipping comment.");
                }
            } catch (e) {
                console.error("⚠️ Failed to post PR comment:", e.message);
                // No hacemos process.exit aquí, queremos que falle abajo
            }
        } else if (process.env.GITHUB_ACTIONS && !githubToken) {
            console.warn("⚠️ GitHub Actions detected but no GITHUB_TOKEN provided. Skipping comment.");
        }

        process.exit(1); // Fallar el build
    } else {
        console.log("✅ All clear.");
        process.exit(0);
    }
}

analyze();