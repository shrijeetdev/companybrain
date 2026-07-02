// Build script: bundles our TypeScript monorepo into a single dist/server.js.
// Third-party npm packages stay external (resolved from node_modules at runtime).
// Run: node scripts/build.mjs
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const external = [
  // Runtime deps resolved from root node_modules at start-up.
  "fastify",
  "@fastify/cors",
  "@fastify/rate-limit",
  "@fastify/static",
  "better-sqlite3",
  "@anthropic-ai/sdk",
  "@supabase/supabase-js",
  "@sentry/node",
  "@whiskeysockets/baileys",
  "qrcode-terminal",
  "zod",
  // Logger stack: keep external to avoid ESM bundle runtime issues.
  "pino",
  "pino-pretty",
  // Optional native accelerators used by ws stack.
  "bufferutil",
  "utf-8-validate",
];

await build({
  entryPoints: ["cli/bin/companybrain.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  // Keep selected npm packages external; workspace @companybrain/* stays bundled.
  external,
  logLevel: "info",
});

console.log(`build complete → dist/server.js (${external.length} externals)`);
