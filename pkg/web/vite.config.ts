import posthogRollupPlugin from '@posthog/rollup-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'rollup';
import { defineConfig } from 'vite';
import { getServerConfig } from './src/server/env.js';

const serverConfig = getServerConfig();
const posthogSourceMapsPlugin =
  serverConfig.posthogSourceMaps.enabled &&
  serverConfig.posthogSourceMaps.apiKey &&
  serverConfig.posthogSourceMaps.projectId
    ? [
        makePostHogSourceMapsPlugin({
          apiKey: serverConfig.posthogSourceMaps.apiKey,
          projectId: serverConfig.posthogSourceMaps.projectId,
          host: serverConfig.posthogSourceMaps.host,
          releaseVersion: serverConfig.clientConfig.posthog.release ?? 'local',
        }),
      ]
    : [];

function makePostHogSourceMapsPlugin({
  apiKey,
  projectId,
  host,
  releaseVersion,
}: {
  apiKey: string;
  projectId: string;
  host: string;
  releaseVersion: string;
}): Plugin {
  const plugin = posthogRollupPlugin({
    personalApiKey: apiKey,
    projectId,
    host,
    sourcemaps: {
      enabled: true,
      releaseName: 'jedidiah-web',
      releaseVersion,
    },
  });
  const writeBundle = plugin.writeBundle;

  if (!writeBundle || typeof writeBundle === 'function') {
    return plugin;
  }

  return {
    ...plugin,
    writeBundle: {
      ...writeBundle,
      async handler(options, bundle) {
        try {
          await writeBundle.handler.call(this, options, bundle);
        } catch (error) {
          this.warn(
            `PostHog source map upload failed; continuing build. ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    },
  };
}

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
