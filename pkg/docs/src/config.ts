import { defineConfig } from 'vitepress';
import { FAVICON_FILENAME } from './favicon';
import { listContentPages } from './pages';
import { buildSidebar, DOCS_SECTIONS } from './sidebar';

const BROWSER_TARGET = 'es2022';

export const docsConfig = defineConfig({
  title: 'JedidiahOps Help',
  description: 'How to do the work JedidiahOps records.',
  lang: 'en',
  srcDir: 'content',
  outDir: 'dist',
  cleanUrls: true,
  metaChunk: true,
  // The site is public so a shared tablet can open it mid-task, but it is not for search engines.
  head: [
    ['meta', { name: 'robots', content: 'noindex, nofollow' }],
    ['link', { rel: 'icon', type: 'image/png', href: `/${FAVICON_FILENAME}` }],
  ],
  // VitePress 1.x pins Vite 5, whose default browser target (down to Safari 14) the workspace-wide
  // esbuild override refuses to transform destructuring for. Modern browsers are the only audience
  // of an internal help site, so raise the target for both the build and dependency prebundling.
  vite: {
    build: { target: BROWSER_TARGET },
    optimizeDeps: { esbuildOptions: { target: BROWSER_TARGET } },
  },
  themeConfig: {
    // The two-tone wordmark is rendered by the custom theme's nav slot instead.
    siteTitle: false,
    search: { provider: 'local' },
    sidebar: buildSidebar(DOCS_SECTIONS, listContentPages()),
    outline: 'deep',
    docFooter: { prev: false, next: false },
  },
});

export default docsConfig;
