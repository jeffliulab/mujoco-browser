import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP headers are required for SharedArrayBuffer (used later by the
// MuJoCo WASM worker). GitHub Pages does not let us set headers, so on
// production builds we fall back to postMessage (handled in sim/worker.ts).
// Locally we set them so dev mirrors the fast path.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
});
