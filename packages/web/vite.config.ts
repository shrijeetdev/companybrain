import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mockPort = process.env.MOCK_PORT ?? '8787';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: `${repoRoot}dist/web`,
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: Number(process.env.PORT ?? 5173),
    proxy: {
      '/api': { target: `http://127.0.0.1:${mockPort}`, changeOrigin: false },
    },
  },
  preview: { port: 4173 },
});
