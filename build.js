const esbuild = require('esbuild');

console.log("🔨 Building CommitRadar...");

esbuild.build({
  entryPoints: ['commit-radar.js'],
  bundle: true,
  platform: 'node',
  target: ['node18'],
  outfile: 'dist/index.js',
  minify: true,
  keepNames: true,
  external: ['madge', 'openai', 'dotenv', 'husky'],
}).then(() => {
    console.log("✅ Build successful in /dist/index.js");
}).catch(() => process.exit(1));