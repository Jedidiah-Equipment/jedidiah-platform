import { AssistantModalPrimitive } from '@assistant-ui/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar.js';

import { AssistantSidebarTrigger } from './assistant-sidebar-trigger.js';

describe('AssistantSidebarTrigger', () => {
  it('presents the assistant as a subtle sidebar action instead of a fixed viewport button', () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <AssistantModalPrimitive.Root>
          <AssistantSidebarTrigger />
        </AssistantModalPrimitive.Root>
      </SidebarProvider>,
    );

    expect(html).toContain('AI Assistant');
    expect(html).toContain('text-primary');
    expect(html).not.toContain('bg-primary');
    expect(html).not.toContain('fixed');
  });
});
