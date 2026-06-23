import { createFileRoute } from '@tanstack/react-router';

// Public route that generates and streams a Product's brochure PDF by Product id. The server-only handler
// is dynamically imported so @pkg/core, the S3 client, and @pkg/pdf (react-pdf) stay out of the client
// route-tree bundle. An incomplete brochure or unknown id resolves to a 404.
export const Route = createFileRoute('/downloads/products/$productId/brochure')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { serveProductBrochure } = await import('../../../../server/brochure-handlers.js');

        return serveProductBrochure(params.productId);
      },
    },
  },
});
