#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const madge = require('madge');
const { OpenAI } = require('openai');

// --- 1. CONFIG & SECURITY ---

// Load .env from the user's project root (current working directory)
const envPath = path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

const apiKey = process.env.OPENAI_API_KEY || 'ollama'; 
const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Validamos solo si es la URL oficial de OpenAI. Para local, somos permisivos.
if (baseURL.includes('openai.com') && (!process.env.OPENAI_API_KEY)) {
    console.error("❌ CRITICAL ERROR: OPENAI_API_KEY not found for OpenAI usage.");
    console.error(`   Please ensure you have a .env file at: ${envPath}`);
    process.exit(1);
}

const openai = new OpenAI({ 
    apiKey: apiKey,
    baseURL: baseURL
});

console.log(`🔌 Connected to LLM Provider: ${baseURL.includes('openai.com') ? 'OpenAI Cloud' : 'Local/Custom Endpoint'}`);
console.log(`🤖 Model: ${modelName}`);

// --- 2. BUSINESS RULES (CIRCUIT BREAKERS) ---
const MAX_FILES_ALLOWED = 10;   // Skip analysis if massive commit (migrations, etc.)
const MAX_LINES_ALLOWED = 400;  // Skip huge files to save tokens/money.

// --- 3. UTILS ---

function getStagedFiles() {
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
            console.log(`⚠️  Skipping ${path.basename(filePath)}: Too large (${lines} lines). Saving tokens.`);
            return true;
        }
        return false;
    } catch (e) {
        return true;
    }
}

// --- 4. MAIN LOGIC ---

async function analyze() {
    console.log("🕵️  CommitRadar: Starting security scan...");

    const stagedFiles = getStagedFiles();
    const codeFiles = stagedFiles.filter(f => /\.(js|ts|jsx|tsx)$/.test(f));

    // RULE 1: No code? Pass.
    if (codeFiles.length === 0) {
        console.log("✅ No logical code changes detected. Commit allowed.");
        process.exit(0);
    }

    // RULE 2: Massive commit? Pass (Cost protection).
    if (codeFiles.length > MAX_FILES_ALLOWED) {
        console.log(`⚠️  Massive commit detected (${codeFiles.length} files).`);
        console.log("   Skipping AI analysis to avoid blocking workflow.");
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
        console.error("⚠️ Error generating dependency graph. Skipping semantic analysis.");
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

        // Filter out huge dependents
        const safeImpacted = impacted.filter(imp => !isFileTooBig(imp)).slice(0, 2);

        if (safeImpacted.length === 0) {
            console.log(`ℹ️  ${file} has dependents, but they are too large/complex. Skipping.`);
            continue;
        }

        console.log(`⚡ Analyzing impact of '${file}' on: ${safeImpacted.join(', ')}`);

        // --- PROMPT ENGINEERING (ENGLISH) ---
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

        // --- OPENAI CALL ---
        try {

            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: modelName, // <--- CAMBIO AQUÍ (antes era "gpt-4o-mini")
                response_format: { type: "json_object" },
                temperature: 0
            });

            const result = JSON.parse(completion.choices[0].message.content);

            console.log(`🤖 Analysis for ${file}:`);
            console.log(`   Risk:   ${result.risk}`);
            console.log(`   Reason: ${result.reason}\n`);

            if (result.verdict === "REJECTED" || result.risk === "CRITICAL") {
                riskDetected = true;
            }

        } catch (error) {
            console.error("⚠️ AI Analysis failed:", error.message);
        }
    }

    // --- FINAL VERDICT ---
    if (riskDetected) {
        console.error("\n❌ AUTOMATIC BLOCK: Critical risks detected.");
        console.error("   CommitRadar prevented this commit to protect production.");
        process.exit(1); // BLOCK COMMIT
    } else {
        console.log("✅ All clear. Commit allowed.");
        process.exit(0);
    }
}

analyze();