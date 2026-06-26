import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = join(__dirname, 'server.log');

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try {
    appendFileSync(logFile, line);
  } catch {}
  console.log(line.trim());
}

log('[server.js] starting...');

try {
  const { register } = await import('tsx/esm/api');
  log('[server.js] tsx register imported');
  register();
  log('[server.js] tsx registered, importing app...');
  await import('./cli/bin/companybrain.ts');
} catch (err) {
  log('[server.js] fatal error:', err.stack || err.message || err);
  process.exit(1);
}
