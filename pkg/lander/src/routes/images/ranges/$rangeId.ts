import { createFileRoute } from '@tanstack/react-router';

// Public, read-only route serving an optimized (downscaled WebP) Product Range image by Range id. Shared by
// Home, Products, and Product detail. The server-only handler is dynamically imported so @pkg/core, the S3
// client, and sharp stay out of the client route-tree bundle.
export const Route = createFileRoute('/images/ranges/$rangeId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { serveRangeImage } = await import('../../../server/media/image-handlers.js');
        const versioned = new URL(request.url).searchParams.has('v');

        return serveRangeImage(params.rangeId, { versioned });
      },
    },
  },
});
