import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';

import { Footer } from '../components/footer.js';
import { Nav } from '../components/nav.js';
import appCss from '../styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Jedidiah Equipment — South African Built. Farmer Proven.' },
      {
        name: 'description',
        content:
          'Heavy-duty agricultural equipment engineered to perform in South African conditions. Browse the Jedidiah Equipment range.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Jedidiah Equipment' },
      {
        property: 'og:description',
        content: 'Heavy-duty agricultural equipment engineered to perform in South African conditions.',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Nav />
        <Outlet />
        <Footer />
        <Scripts />
      </body>
    </html>
  );
}
