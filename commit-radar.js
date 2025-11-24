#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const madge = require('madge');
const { OpenAI } = require('openai');
const core = require('@actions/core');
const github = require('@actions/github');
const { minimatch } = require('minimatch');

// --- 1. CONFIG LOADER & DEFAULTS ---

const envPath = path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

// Valores por defecto (Fallback)
const DEFAULTS = {
    thresholds: {
        maxFiles: 15,
        maxLines: 500
    },
    exclude: [
        '**/*.test.js', 
        '**/*.spec.js', 
        '**/node_modules/**', 
        '**/dist/**', 
        '**/build/**'
    ],
    model: 'gpt-4o-mini'
};

// Intentar cargar commit-radar.config.js
let userConfig = {};
try {
    const configPath = path.resolve(process.cwd(), 'commit-radar.config.js');
    if (fs.existsSync(configPath)) {
        console.log("⚙️  Loaded commit-radar.config.js");
        userConfig = require(configPath);
    }
} catch (e) {
    console.warn("⚠️  Could not load config file, using defaults.");
}

// Fusión de configuraciones (User > Env > Default)
const CONFIG = {
    thresholds: { ...DEFAULTS.thresholds, ...userConfig.thresholds },
    exclude: userConfig.exclude || DEFAULTS.exclude,
    model: core.getInput('openai_model') || process.env.OPENAI_MODEL || userConfig.model || DEFAULTS.model
};

// Setup de API Keys
const apiKey = core.getInput('openai_api_key') || process.env.OPENAI_API_KEY || process.env.INPUT_OPENAI_API_KEY || 'ollama';
const baseURL = core.getInput('openai_base_url') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN;

if (baseURL.includes('openai.com') && (!apiKey || apiKey === 'ollama')) {
    console.error("❌ CRITICAL ERROR: OPENAI_API_KEY not found.");
    process.exit(1);
}

const openai = new OpenAI({ apiKey, baseURL });

// --- 2. UTILS ---

function getChangedFiles() {
    if (process.env.GITHUB_ACTIONS) {
        try {
            const baseBranch = process.env.GITHUB_BASE_REF || 'main';
            const cmd = `git diff --name-only origin/${baseBranch}...HEAD`;
            const output = execSync(cmd, { encoding: 'utf8' });
            return output.split('\n').filter(line => line.trim() !== '');
        } catch (e) {
            console.error("⚠️  CI Git Diff failed (Check fetch-depth: 0).");
            return []; 
        }
    }
    try {
        const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
        return output.split('\n').filter(line => line.trim() !== '');
    } catch (e) { return []; }
}

function isFileTooBig(filePath) {
    try {
        if (!fs.existsSync(filePath)) return true;
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').length;
        if (lines > CONFIG.thresholds.maxLines) {
            console.log(`⚠️  Skipping ${path.basename(filePath)}: Too large (> ${CONFIG.thresholds.maxLines} lines).`);
            return true;
        }
        return false;
    } catch (e) { return true; }
}

function isExcluded(filePath) {
    // Revisa si el archivo coincide con algún patrón de exclusión
    return CONFIG.exclude.some(pattern => minimatch(filePath, pattern));
}

// --- 3. MAIN LOGIC ---

async function analyze() {
    console.log(`🔌 Provider: ${baseURL.includes('openai.com') ? 'OpenAI' : 'Local'}`);
    console.log(`🤖 Model: ${CONFIG.model}`);
    
    const allChangedFiles = getChangedFiles();
    
    // Filtro 1: Solo JS/TS
    let codeFiles = allChangedFiles.filter(f => /\.(js|ts|jsx|tsx)$/.test(f));
    
    // Filtro 2: Exclusiones del Config (NUEVO)
    codeFiles = codeFiles.filter(f => {
        if (isExcluded(f)) {
            console.log(`🚫 Ignoring ${f} (Matched exclude pattern)`);
            return false;
        }
        return true;
    });

    if (codeFiles.length === 0) {
        console.log("✅ No relevant code changes detected.");
        process.exit(0);
    }

    if (codeFiles.length > CONFIG.thresholds.maxFiles) {
        console.log(`⚠️  Massive commit (${codeFiles.length} files > limit ${CONFIG.thresholds.maxFiles}). Skipping.`);
        process.exit(0);
    }

    console.log("🕵️  CommitRadar: Scanning...");
    console.log(`🧠 Building dependency graph...`);
    
    let tree = {};
    try {
        // Madge sigue escaneando todo para entender el contexto, 
        // pero solo analizaremos los archivos filtrados.
        const res = await madge('.', { 
            fileExtensions: ['js', 'ts', 'jsx', 'tsx'], 
            excludeRegExp: [/^node_modules/, /^\.git/] 
        });
        tree = res.obj();
    } catch (e) { process.exit(0); }

    let riskDetected = false;
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
        let prompt = `You are a strict CI/CD Guardian. Detect broken logic/types.\n\n`;
        prompt += `--- MODIFIED: ${file} ---\n${sourceCode}\n\n`;
        safeImpacted.forEach(imp => {
            prompt += `--- DEPENDENT: ${imp} ---\n${fs.readFileSync(imp, 'utf8')}\n\n`;
        });
        prompt += `Respond JSON: { "verdict": "APPROVED"|"REJECTED", "risk": "LOW"|"CRITICAL", "reason": "1 sentence explanation" }`;

        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: CONFIG.model,
                response_format: { type: "json_object" },
                temperature: 0
            });

            const result = JSON.parse(completion.choices[0].message.content);
            
            if (result.verdict === "REJECTED" || result.risk === "CRITICAL") {
                riskDetected = true;
                const reason = result.reason;
                console.log(`❌ RISK in ${file}: ${reason}`);
                
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
        if (process.env.GITHUB_ACTIONS && githubToken) {
            try {
                const octokit = github.getOctokit(githubToken);
                const context = github.context;
                if (context.payload.pull_request) {
                    await octokit.rest.issues.createComment({
                        ...context.repo,
                        issue_number: context.payload.pull_request.number,
                        body: reportMarkdown
                    });
                    console.log("✅ Comment posted successfully.");
                }
            } catch (e) { console.error("⚠️ Failed to post PR comment:", e.message); }
        }
        process.exit(1);
    } else {
        console.log("✅ All clear.");
        process.exit(0);
    }
}

analyze();