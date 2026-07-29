import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

import { permanentRedirectLocation } from './server/permanent-redirect.js';

export default createServerEntry({
  fetch(request) {
    const redirectLocation = permanentRedirectLocation(request.url);
    if (redirectLocation) {
      return new Response(null, { status: 301, headers: { location: redirectLocation } });
    }

    return handler.fetch(request);
  },
});
