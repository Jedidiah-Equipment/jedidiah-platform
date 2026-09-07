import { useData, useRouter } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { defineComponent, h } from 'vue';

import './brand.css';

/** The app's wordmark: name in the text colour, product in the brand yellow, section muted. */
const Wordmark = () =>
  h('span', { class: 'jed-wordmark' }, [
    'Jedidiah',
    h('span', { class: 'jed-wordmark-accent' }, 'Ops'),
    h('span', { class: 'jed-wordmark-suffix' }, 'Help'),
  ]);

const BusinessSwitcher = defineComponent({
  setup() {
    const { localeIndex } = useData();
    const router = useRouter();

    return () =>
      h(
        'select',
        {
          class: 'jed-business-switcher',
          'aria-label': 'Business',
          value: localeIndex.value === 'contracting' ? '/contracting/' : '/',
          onChange: (event: Event) => router.go((event.target as HTMLSelectElement).value),
        },
        [h('option', { value: '/' }, 'Equipment'), h('option', { value: '/contracting/' }, 'Contracting')],
      );
  },
});

/**
 * The default theme wearing the app's brand: Geist, the two brand yellows, and the two-tone
 * wordmark. `themeConfig.siteTitle` is off so this slot owns the title instead of plain text.
 */
export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'nav-bar-title-before': () => h(Wordmark),
      'nav-bar-content-before': () => h(BusinessSwitcher),
    }),
};
