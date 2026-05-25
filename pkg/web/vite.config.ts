import posthogRollupPlugin from '@posthog/rollup-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { getServerConfig } from './src/server/env.js';

const serverConfig = getServerConfig();
const posthogSourceMapsPlugin =
  serverConfig.posthogSourceMaps.enabled &&
  serverConfig.posthogSourceMaps.apiKey &&
  serverConfig.posthogSourceMaps.projectId
    ? [
        posthogRollupPlugin({
          personalApiKey: serverConfig.posthogSourceMaps.apiKey,
          projectId: serverConfig.posthogSourceMaps.projectId,
          host: serverConfig.posthogSourceMaps.host,
          sourcemaps: {
            enabled: true,
            releaseName: 'jedidiah-web',
            releaseVersion: serverConfig.clientConfig.posthog.release ?? 'local',
          },
        }),
      ]
    : [];

export default defineConfig({
  build: {
    sourcemap: serverConfig.posthogSourceMaps.enabled,
  },
  define: {
    __APP_CONFIG__: JSON.stringify(serverConfig.clientConfig),
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackRouter({
      generatedRouteTree: './src/app/route-tree.gen.ts',
      target: 'react',
    }),
    react(),
    tailwindcss(),
    ...posthogSourceMapsPlugin,
  ],
  server: {
    port: serverConfig.port,
  },
  preview: {
    port: 4173,
  },
});
