import { describe, expect, test } from 'vitest';

import { renderPlainTextEmailHtml } from './email.js';

describe('renderPlainTextEmailHtml', () => {
  test('renders non-empty lines as escaped paragraphs', () => {
    expect(renderPlainTextEmailHtml(' Hello <Acme> & team \n\n Quote attached. ')).toBe(
      '<p>Hello &lt;Acme&gt; &amp; team</p>\n<p>Quote attached.</p>',
    );
  });
});
