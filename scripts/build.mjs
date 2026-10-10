// Production build → dist/
//   dist/server.js   the whole backend in one ESM bundle (workspace packages + pure-JS deps)
//   dist/web/        the React SPA (Vite)
//
// dist/ is committed: some hosts (Hostinger) can't run esbuild in their build sandbox, so the
// server boots straight from the committed bundle with `node server.js`.
//
// Run: pnpm build   (or: node scripts/build.mjs [--server-only|--web-only])

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const doServer = !args.has('--web-only');
const doWeb = !args.has('--server-only');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

mkdirSync(join(root, 'dist'), { recursive: true });

if (doServer) {
  // Kept external: native modules and the optional WhatsApp QR library (lazy-loaded).
  const external = ['better-sqlite3', '@whiskeysockets/baileys', 'bufferutil', 'utf-8-validate'];
  await build({
    entryPoints: [join(root, 'cli/bin/companybrain.ts')],
    outfile: join(root, 'dist/server.js'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    external,
    legalComments: 'none',
    logLevel: 'warning',
    define: { 'process.env.COMPANYBRAIN_BUILD_VERSION': JSON.stringify(version) },
    // Bundled CommonJS deps call require() for Node builtins; give the ESM bundle a real one.
    banner: {
      js: [
        "import { createRequire as __cbCreateRequire } from 'node:module';",
        'const require = __cbCreateRequire(import.meta.url);',
      ].join('\n'),
    },
  });
  console.log(`✓ dist/server.js (externals: ${external.join(', ')})`);
}

if (doWeb) {
  execFileSync('pnpm', ['--filter', '@companybrain/web', 'build'], { cwd: root, stdio: 'inherit' });
  console.log('✓ dist/web/');
}
