import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';

import { Footer } from '../components/footer.js';
import { Nav } from '../components/nav.js';
import { resolveRouteLocale } from '../lib/locale.js';
import { honorLocalePreference } from '../lib/locale-preference.js';
import { LocaleProvider, messagesForLocale } from '../messages/index.js';
import { getFooterRanges } from '../server/catalog/ranges.js';

export const Route = createFileRoute('/{-$locale}')({
  beforeLoad: ({ params }) => {
    const locale = resolveRouteLocale(params.locale);
    if (!locale) {
      throw notFound();
    }
    honorLocalePreference(locale);

    return { locale };
  },
  head: ({ params }) => {
    const locale = resolveRouteLocale(params.locale);
    if (!locale) {
      return {};
    }

    return { meta: [{ property: 'og:site_name', content: messagesForLocale(locale).site.ogSiteName }] };
  },
  loader: async () => ({ footerRanges: await getFooterRanges() }),
  component: LocaleLayout,
});

function LocaleLayout() {
  const { locale } = Route.useRouteContext();
  const { footerRanges } = Route.useLoaderData();

  return (
    <LocaleProvider locale={locale}>
      <Nav />
      <Outlet />
      <Footer ranges={footerRanges} />
    </LocaleProvider>
  );
}
