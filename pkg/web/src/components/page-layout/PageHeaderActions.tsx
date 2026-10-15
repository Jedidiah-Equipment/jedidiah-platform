import { IconChevronDown } from '@tabler/icons-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { cn } from '@/lib/utils.js';

export type PageHeaderAction = {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

/**
 * Place in PageLayout.actions. Keep action dialogs outside this group so closing the menu cannot unmount them.
 * The buttons collapse into a menu only when they no longer fit on one row beside the page title.
 */
export function PageHeaderActions({ actions, title }: { actions: readonly PageHeaderAction[]; title: string }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const hasActions = actions.length > 0;

  useLayoutEffect(() => {
    const area = areaRef.current;
    const row = measureRef.current;
    if (!hasActions || !area || !row) return;
    // The hidden copy keeps the one-row width known while the menu is showing.
    const measure = () => setCollapsed(row.offsetWidth > area.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(row);
    return () => observer.disconnect();
  }, [hasActions]);

  if (!hasActions) return null;
  const buttons = actions.map((action) => (
    <Button key={action.label} disabled={action.disabled} onClick={action.onClick} variant="outline">
      {action.icon}
      {action.label}
    </Button>
  ));

  return (
    <div
      ref={areaRef}
      className={cn('relative flex w-0 min-w-0 flex-1 sm:justify-end', collapsed && 'min-w-fit')}
      data-slot="page-header-actions"
    >
      <div
        ref={measureRef}
        aria-hidden
        className="invisible absolute top-0 right-0 flex w-max items-center gap-2"
        data-slot="page-header-actions-measure"
        inert
      >
        {buttons}
      </div>
      {collapsed ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Actions
            <IconChevronDown data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{title}</DropdownMenuLabel>
              {actions.map((action) => (
                <DropdownMenuItem key={action.label} disabled={action.disabled} onClick={action.onClick}>
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex items-center gap-2">{buttons}</div>
      )}
    </div>
  );
}
