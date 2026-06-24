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
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  server: {
    port: getLanderConfig().PORT,
  },
});
