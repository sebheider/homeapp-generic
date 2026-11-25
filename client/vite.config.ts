import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // the app bundles ../CHANGELOG.md (version + release notes, see src/lib/version.ts)
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:8099',
      '/ws': { target: 'ws://localhost:8099', ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 900 },
});
