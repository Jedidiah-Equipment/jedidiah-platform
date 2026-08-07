import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

import { permanentRedirectLocation } from './server/permanent-redirect.js';
import { createStaticAssetServer } from './server/runtime/static-assets.js';

// `vite build` writes this module to `dist/server/server.js`, with the client build as its sibling. In dev
// the path resolves to a directory that does not exist, which is what we want: Vite owns asset URLs there.
const serveStaticAsset = createStaticAssetServer(new URL('../client/', import.meta.url));

export default createServerEntry({
  async fetch(request) {
    const redirectLocation = permanentRedirectLocation(request.url);
    if (redirectLocation) {
      return new Response(null, { status: 301, headers: { location: redirectLocation } });
    }

    // Ahead of the router: a built asset is a file on disk and never needs the SSR handler. Returns null
    // in dev, where Vite owns these paths.
    const asset = await serveStaticAsset(request);
    if (asset) {
      return asset;
    }

    return handler.fetch(request);
  },
});
