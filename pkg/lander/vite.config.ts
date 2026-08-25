import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { getLanderConfig } from './src/server/runtime/env.js';

const SERVER_WORKSPACE_EXTERNALS = new Set(['@pkg/core', '@pkg/pdf']);

function preserveServerWorkspacePackageBoundaries(): Plugin {
  return {
    name: 'lander:preserve-server-workspace-package-boundaries',
    enforce: 'pre',
    resolveId(source, _importer, options) {
      if (options.ssr && SERVER_WORKSPACE_EXTERNALS.has(source)) {
        return { id: source, external: true };
      }
    },
  };
}

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
  // The pre-plugin runs before tsconfig path resolution maps workspace imports to source files. Keeping
  // these packages external preserves pdfkit's package-private standard-font imports at runtime.
  plugins: [preserveServerWorkspacePackageBoundaries(), tailwindcss(), tanstackStart(), viteReact()],
  server: {
    port: getLanderConfig().PORT,
  },
});
