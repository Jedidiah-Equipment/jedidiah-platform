import { createFileRoute } from '@tanstack/react-router';

// Public, read-only route serving an optimized (downscaled WebP) Product image by Product id. Shared by
// Home, Products, and Product detail. The server-only handler is dynamically imported so @pkg/core, the S3
// client, and sharp stay out of the client route-tree bundle.
export const Route = createFileRoute('/images/products/$productId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { serveProductImage } = await import('../../../server/media/image-handlers.js');
        const search = new URL(request.url).searchParams;

        return serveProductImage(params.productId, search.get('slot'), { versioned: search.has('v') });
      },
    },
  },
});
