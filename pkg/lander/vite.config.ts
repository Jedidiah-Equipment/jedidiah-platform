import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { getLanderConfig } from './src/server/runtime/env.js';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom'],
  },
  // sharp is a native module: keep it external to the SSR bundle so it is loaded from node_modules at
  // runtime rather than bundled (which would break its platform binary resolution).
  ssr: {
    external: ['sharp'],
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  server: {
    port: getLanderConfig().PORT,
  },
});
