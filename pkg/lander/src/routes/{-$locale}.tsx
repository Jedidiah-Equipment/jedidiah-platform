import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';

import { Footer } from '../components/footer.js';
import { Nav } from '../components/nav.js';
import { type LocaleRouteContext, requireRouteContextLocale, resolveRouteLocale } from '../lib/locale.js';
import { honorLocalePreference } from '../lib/locale-preference.js';
import { LocaleProvider, messagesForLocale } from '../messages/index.js';
import { type FooterRange, getFooterRanges } from '../server/catalog/ranges.js';

async function loadLocaleLayout({ context }: { context: LocaleRouteContext }): Promise<{
  footerRanges: FooterRange[];
}> {
  return { footerRanges: await getFooterRanges({ data: { locale: requireRouteContextLocale(context) } }) };
}

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
  loader: loadLocaleLayout,
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
