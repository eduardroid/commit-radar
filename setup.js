const { execSync } = require('child_process');
const fs = require('fs');

try {
    console.log("🛠️  Configuring CommitRadar...");
    
    // 1. Inicializar Husky
    execSync('npm install husky --no-save', { stdio: 'inherit' });
    execSync('npx husky init', { stdio: 'inherit' });
    
    // 2. Escribir el hook (AQUÍ ESTÁ EL CAMBIO CLAVE)
    const hookPath = '.husky/pre-commit';
    // Ahora llamamos a 'commit-radar'
    fs.writeFileSync(hookPath, '#!/bin/sh\nnpx commit-radar\n', { mode: 0o755 });
    
    console.log("📡 CommitRadar is ready. Try your first commit!");
} catch (e) {
    console.error("❌ Setup failed. Please install manually.");
}