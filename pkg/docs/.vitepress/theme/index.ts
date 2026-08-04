import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

import './brand.css';

/** The app's wordmark: name in the text colour, product in the brand yellow, section muted. */
const Wordmark = () =>
  h('span', { class: 'jed-wordmark' }, [
    'Jedidiah',
    h('span', { class: 'jed-wordmark-accent' }, 'Ops'),
    h('span', { class: 'jed-wordmark-suffix' }, 'Help'),
  ]);

/**
 * The default theme wearing the app's brand: Geist, the two brand yellows, and the two-tone
 * wordmark. `themeConfig.siteTitle` is off so this slot owns the title instead of plain text.
 */
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'nav-bar-title-before': () => h(Wordmark) }),
};
