const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. DETECTAR LA RAÍZ DEL USUARIO
// INIT_CWD es la carpeta desde donde el usuario ejecutó 'npm install'.
// Si no existe, usamos ../.. asumiendo que estamos en node_modules/commit-radar
const userRoot = process.env.INIT_CWD || path.resolve(__dirname, '../../');

console.log("⚙️  Configurando CommitRadar en:", userRoot);

const huskyDir = path.join(userRoot, '.husky');
const hookFile = path.join(huskyDir, 'pre-commit');

try {
    // 2. VERIFICAR QUE SEA UN REPO GIT
    if (!fs.existsSync(path.join(userRoot, '.git'))) {
        console.log("ℹ️  No se detectó repositorio Git. Saltando configuración automática.");
        process.exit(0);
    }

    // 3. PASO 1: CREAR CARPETA .HUSKY (Equivalente a husky init)
    if (!fs.existsSync(huskyDir)) {
        fs.mkdirSync(huskyDir, { recursive: true });
    }

    // 4. PASO 2: ESCRIBIR EL HOOK
    // Sobrescribimos o creamos el archivo pre-commit
    const hookContent = '#!/bin/sh\nnpx commit-radar\n';
    fs.writeFileSync(hookFile, hookContent, { mode: 0o755 }); // 0o755 da permisos de ejecución (+x)
    
    // 5. PASO 3: CONFIGURAR GIT (Core hooks path)
    try {
        execSync('git config core.hooksPath .husky', { cwd: userRoot, stdio: 'ignore' });
    } catch (gitError) {
        console.error("⚠️  No se pudo configurar git config core.hooksPath. Hazlo manualmente si falla.");
    }

    // 6. PASO 4: PERMISOS (Redundancia para Linux/Mac)
    try {
        fs.chmodSync(hookFile, '755');
    } catch (e) {
        // Ignorar en Windows
    }

    console.log("✅ CommitRadar instalado y activado exitosamente.");

} catch (error) {
    console.error("❌ Error en la configuración automática:", error.message);
    console.log("   Por favor ejecuta: npx husky init && echo 'npx commit-radar' > .husky/pre-commit");
}