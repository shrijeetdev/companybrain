// Build script: bundles our TypeScript monorepo into a single dist/server.js.
// Third-party npm packages stay external (resolved from node_modules at runtime).
// Run: node scripts/build.mjs
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['cli/bin/companybrain.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/server.js',
  // Keep all npm packages external — only our @companybrain/* workspace code gets bundled.
  external: [
    'fastify',
    'better-sqlite3',
    '@anthropic-ai/sdk',
    '@whiskeysockets/baileys',
    'qrcode-terminal',
    'bufferutil',
    'utf-8-validate',
  ],
  logLevel: 'info',
});

console.log('build complete → dist/server.js');
