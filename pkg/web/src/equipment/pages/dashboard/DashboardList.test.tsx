import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DashboardList, DashboardListItem, DashboardListScrollArea } from './DashboardList.js';
import { QUOTE_LIST_CARD_HEIGHT_PX } from './dashboard-widget-layout.js';

describe('DashboardList', () => {
  it('owns the shared divider and row spacing', () => {
    const html = renderToStaticMarkup(
      <DashboardList className="pr-3">
        <DashboardListItem className="text-sm">First</DashboardListItem>
        <DashboardListItem>Second</DashboardListItem>
      </DashboardList>,
    );

    expect(html).toContain('flex flex-col divide-y pr-3');
    expect(html).toContain('py-3 first:pt-0 last:pb-0 text-sm');
    expect(html.match(/data-slot="dashboard-list-item"/g)).toHaveLength(2);
  });

  it('provides the shared fixed-height scroll region', () => {
    const html = renderToStaticMarkup(
      <DashboardListScrollArea>
        <DashboardList>
          <DashboardListItem>Quote</DashboardListItem>
        </DashboardList>
      </DashboardListScrollArea>,
    );

    expect(html).toContain('data-slot="scroll-area"');
    expect(html).toContain(`height:${QUOTE_LIST_CARD_HEIGHT_PX}px`);
  });
});
