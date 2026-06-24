import { createFileRoute } from '@tanstack/react-router';

// Public, read-only route streaming Product image bytes from S3 by Product id. Shared by Home, Products,
// and Product detail. The server-only handler is dynamically imported so @pkg/core and the S3 client stay
// out of the client route-tree bundle.
export const Route = createFileRoute('/images/products/$productId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { serveProductImage } = await import('../../../server/media/image-handlers.js');
        const slot = new URL(request.url).searchParams.get('slot');

        return serveProductImage(params.productId, slot);
      },
    },
  },
});
