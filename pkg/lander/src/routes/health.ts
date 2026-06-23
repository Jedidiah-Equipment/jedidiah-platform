import { createFileRoute } from '@tanstack/react-router';

// Plain server route for the Railway healthcheck. No SSR component — just a 200.
export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: () => new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } }),
    },
  },
});
