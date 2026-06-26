// Production entry point for hosts that expect a plain Node.js file.
// Registers tsx so the TypeScript bootstrap can run directly.
import { register } from 'tsx/esm/api';
register();
await import('./cli/bin/companybrain.ts');
