#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const madge = require('madge');
const { OpenAI } = require('openai');

// --- 1. CONFIG & SECURITY ---

const envPath = path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

// Hybrid Configuration (Local + CI)
const apiKey = process.env.OPENAI_API_KEY || process.env.INPUT_OPENAI_API_KEY || 'ollama'; // INPUT_ es para GitHub Actions
const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Validate API Key only if using official OpenAI endpoint
if (baseURL.includes('openai.com') && (!apiKey || apiKey === 'ollama')) {
    console.error("❌ CRITICAL ERROR: OPENAI_API_KEY not found.");
    console.error("   If running locally, check your .env file.");
    console.error("   If running in GitHub Actions, ensure 'openai_api_key' is passed in 'with'.");
    process.exit(1);
}

const openai = new OpenAI({ 
    apiKey: apiKey,
    baseURL: baseURL
});

// --- 2. BUSINESS RULES ---
const MAX_FILES_ALLOWED = 15;   // Slightly higher for PRs
const MAX_LINES_ALLOWED = 500;

// --- 3. UTILS ---

/**
 * Detección Híbrida de Archivos Modificados
 * - En Local: Usa 'staging' area.
 * - En CI (GitHub): Usa la diferencia entre la rama base y el PR.
 */
function getChangedFiles() {
    // A) GITHUB ACTIONS MODE
    if (process.env.GITHUB_ACTIONS) {
        console.log("☁️  Environment: GitHub Actions (CI)");
        
        try {
            // En un PR, GITHUB_BASE_REF es la rama destino (ej: main)
            const baseBranch = process.env.GITHUB_BASE_REF || 'main';
            
            // IMPORTANTE: Git en CI necesita saber contra qué comparar.
            // Usamos 'origin/base...HEAD' para ver cambios del PR.
            console.log(`   Comparing HEAD against origin/${baseBranch}...`);
            
            const cmd = `git diff --name-only origin/${baseBranch}...HEAD`;
            const output = execSync(cmd, { encoding: 'utf8' });
            return output.split('\n').filter(line => line.trim() !== '');
        } catch (e) {
            console.error("⚠️  CI Git Diff failed.");
            console.error("   HINT: Did you use 'fetch-depth: 0' in actions/checkout?");
            console.error("   Error details:", e.message);
            return []; 
        }
    }

    // B) LOCAL MODE (Husky)
    console.log("💻 Environment: Local (Husky/Staging)");
    try {
        const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
        return output.split('\n').filter(line => line.trim() !== '');
    } catch (e) {
        return [];
    }
}

function isFileTooBig(filePath) {
    try {
        if (!fs.existsSync(filePath)) return true;
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').length;
        
        if (lines > MAX_LINES_ALLOWED) {
            console.log(`⚠️  Skipping ${path.basename(filePath)}: Too large (${lines} lines).`);
            return true;
        }
        return false;
    } catch (e) {
        return true;
    }
}

// --- 4. MAIN LOGIC ---

async function analyze() {
    console.log(`🔌 Connected to LLM Provider: ${baseURL.includes('openai.com') ? 'OpenAI Cloud' : 'Local/Custom'}`);
    console.log(`🤖 Model: ${modelName}`);
    console.log("🕵️  CommitRadar: Starting semantic scan...");

    // CAMBIO: Usamos la nueva función híbrida
    const changedFiles = getChangedFiles();
    const codeFiles = changedFiles.filter(f => /\.(js|ts|jsx|tsx)$/.test(f));

    if (codeFiles.length === 0) {
        console.log("✅ No logical code changes detected. Approved.");
        process.exit(0);
    }

    if (codeFiles.length > MAX_FILES_ALLOWED) {
        console.log(`⚠️  Massive change detected (${codeFiles.length} files).`);
        console.log("   Skipping AI analysis to protect budget/time.");
        process.exit(0);
    }

    console.log(`🧠 Building dependency graph for ${codeFiles.length} files...`);

    let tree = {};
    try {
        const res = await madge('.', { 
            fileExtensions: ['js', 'ts', 'jsx', 'tsx'], 
            excludeRegExp: [/^node_modules/, /^\.git/] 
        });
        tree = res.obj();
    } catch (e) {
        console.error("⚠️ Error generating dependency graph. Skipping.");
        process.exit(0);
    }

    let riskDetected = false;

    for (const file of codeFiles) {
        if (isFileTooBig(file)) continue;

        // --- BLAST RADIUS DETECTION ---
        const fileNameBase = path.basename(file, path.extname(file));
        const impacted = [];

        Object.keys(tree).forEach(importer => {
            const dependencies = tree[importer];
            if (dependencies.some(dep => dep.includes(fileNameBase))) {
                impacted.push(importer);
            }
        });

        if (impacted.length === 0) continue;

        const safeImpacted = impacted.filter(imp => !isFileTooBig(imp)).slice(0, 2);

        if (safeImpacted.length === 0) {
            console.log(`ℹ️  ${file} affects files, but they are too complex to analyze. Skipping.`);
            continue;
        }

        console.log(`⚡ Analyzing impact of '${file}' on: ${safeImpacted.join(', ')}`);

        // --- PROMPT ---
        const sourceCode = fs.readFileSync(file, 'utf8');
        
        let prompt = `You are a strict CI/CD Guardian.\n`;
        prompt += `Your Goal: Detect if the change in the MODIFIED FILE breaks logic or types in the DEPENDENT FILES.\n\n`;
        
        prompt += `--- MODIFIED FILE: ${file} ---\n${sourceCode}\n\n`;
        
        safeImpacted.forEach(imp => {
            prompt += `--- DEPENDENT FILE: ${imp} ---\n${fs.readFileSync(imp, 'utf8')}\n\n`;
        });

        prompt += `INSTRUCTIONS:\n`;
        prompt += `1. Look for type incompatibilities (e.g., Number vs String).\n`;
        prompt += `2. Look for broken function signatures or missing exports.\n`;
        prompt += `3. Respond ONLY with valid JSON in this format:\n`;
        prompt += `{ "verdict": "APPROVED" | "REJECTED", "risk": "LOW" | "CRITICAL", "reason": "Brief technical explanation (1 sentence)" }`;

        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: modelName,
                response_format: { type: "json_object" },
                temperature: 0
            });

            const result = JSON.parse(completion.choices[0].message.content);

            console.log(`🤖 Analysis for ${file}:`);
            console.log(`   Risk:   ${result.risk}`);
            console.log(`   Reason: ${result.reason}\n`);

            if (result.verdict === "REJECTED" || result.risk === "CRITICAL") {
                riskDetected = true;
                // TODO (Future): If in GitHub Actions, post a comment on the PR using Octokit
            }

        } catch (error) {
            console.error("⚠️ AI Analysis failed:", error.message);
        }
    }

    if (riskDetected) {
        console.error("\n❌ AUTOMATIC BLOCK: Critical risks detected.");
        process.exit(1);
    } else {
        console.log("✅ All clear.");
        process.exit(0);
    }
}

analyze();