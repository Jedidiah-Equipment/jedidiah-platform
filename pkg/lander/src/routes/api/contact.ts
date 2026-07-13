import { createFileRoute } from '@tanstack/react-router';

import { CANONICAL_LOCALE, isLocale } from '../../lib/locale.js';

// Public endpoint backing the Contact enquiry form. The server-only handler is dynamically imported so
// Resend and the env config stay out of the client route-tree bundle (mirrors the image/brochure routes).
export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleContactRequest } = await import('../../server/contact/contact-handlers.js');
        const requestedLocale = new URL(request.url).searchParams.get('locale') ?? undefined;
        const locale = isLocale(requestedLocale) ? requestedLocale : CANONICAL_LOCALE;

        return handleContactRequest(request, locale);
      },
    },
  },
});
