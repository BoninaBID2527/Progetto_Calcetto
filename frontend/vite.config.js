import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const backend = process.env.VITE_BACKEND_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  server: {
    port: 5173,
    // La configurazione condivisa sta fuori dalla cartella del frontend.
    fs: { allow: ['..'] },
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
  preview: {
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
