import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageLayout, shouldExitPageLayoutFullscreenOnKey } from './PageLayout.js';

describe('PageLayout fullscreen', () => {
  it('renders the body and aside in the fullscreen overlay without the page header', () => {
    const html = renderToStaticMarkup(
      <PageLayout
        actions={<div>Book Slot Action</div>}
        aside={<div>Selected Job Aside</div>}
        fullscreen
        title="Jobs Header"
      >
        <div>Bay Gantt Body</div>
      </PageLayout>,
    );

    expect(html).toContain('data-page-layout-fullscreen');

    const overlayHtml = html.slice(html.indexOf('data-page-layout-fullscreen'));
    expect(overlayHtml).toContain('Bay Gantt Body');
    expect(overlayHtml).toContain('Selected Job Aside');
    expect(overlayHtml).not.toContain('Jobs Header');
    expect(overlayHtml).not.toContain('Book Slot Action');
  });

  it('renders the body in the normal layout when fullscreen is inactive', () => {
    const html = renderToStaticMarkup(
      <PageLayout aside={<div>Selected Job Aside</div>} title="Jobs Header">
        <div>Bay Gantt Body</div>
      </PageLayout>,
    );

    expect(html).not.toContain('data-page-layout-fullscreen');
    expect(html).toContain('Jobs Header');
    expect(html).toContain('Bay Gantt Body');
    expect(html).toContain('Selected Job Aside');
  });

  it('exits fullscreen only for Escape while fullscreen is active', () => {
    expect(shouldExitPageLayoutFullscreenOnKey({ key: 'Escape' }, true)).toBe(true);
    expect(shouldExitPageLayoutFullscreenOnKey({ key: 'Enter' }, true)).toBe(false);
    expect(shouldExitPageLayoutFullscreenOnKey({ key: 'Escape' }, false)).toBe(false);
  });
});
