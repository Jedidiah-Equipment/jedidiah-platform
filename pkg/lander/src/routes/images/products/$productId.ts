import { createFileRoute } from '@tanstack/react-router';

// Public, read-only route streaming a Product's `primary` image bytes from S3 by Product id. Shared by
// Home, Products, and Product detail. The server-only handler is dynamically imported so @pkg/core and
// the S3 client stay out of the client route-tree bundle.
export const Route = createFileRoute('/images/products/$productId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { serveProductLeadImage } = await import('../../../server/image-handlers.js');

        return serveProductLeadImage(params.productId);
      },
    },
  },
});
