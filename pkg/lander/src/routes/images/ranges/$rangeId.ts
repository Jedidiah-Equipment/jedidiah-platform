import { createFileRoute } from '@tanstack/react-router';

// Public, read-only route streaming a Product Range's image bytes from S3 by Range id. Shared by Home,
// Products, and Product detail. The server-only handler is dynamically imported so @pkg/core and the S3
// client stay out of the client route-tree bundle.
export const Route = createFileRoute('/images/ranges/$rangeId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { serveRangeImage } = await import('../../../server/image-handlers.js');

        return serveRangeImage(params.rangeId);
      },
    },
  },
});
