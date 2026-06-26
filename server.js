// Production entry point for hosts that expect a plain Node.js file.
// Registers tsx so the TypeScript bootstrap can run directly.
console.log('[server.js] starting...');

try {
  const { register } = await import('tsx/esm/api');
  console.log('[server.js] tsx register imported');
  register();
  console.log('[server.js] tsx registered, importing app...');
  await import('./cli/bin/companybrain.ts');
} catch (err) {
  console.error('[server.js] fatal error:', err);
  process.exit(1);
}
