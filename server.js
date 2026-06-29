// Hostinger entry point — boots the pre-built bundle.
// Build first: pnpm build  (or: node scripts/build.mjs)
// Then start:  node server.js  (same as: npm start → node dist/server.js)
await import('./dist/server.js');
