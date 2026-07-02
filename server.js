// Hostinger entry point — boots the pre-built bundle.
// Build first: pnpm build  (or: node scripts/build.mjs)
// Then start:  node server.js  (same as: npm start)
import { existsSync } from "node:fs";

const built = "./dist/server.js";

if (!existsSync(new URL(built, import.meta.url))) {
  console.error(
    "[companybrain] Missing dist/server.js. Build the project before starting.",
  );
  process.exit(1);
}

import(built).catch((err) => {
  console.error("[companybrain] Failed to boot dist/server.js");
  console.error(err);
  process.exit(1);
});
