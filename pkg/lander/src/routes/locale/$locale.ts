import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/locale/$locale')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { handleExplicitLocalePreference } = await import('../../server/locale/locale-preference-handler.js');
        return handleExplicitLocalePreference(request, params.locale);
      },
    },
  },
});
