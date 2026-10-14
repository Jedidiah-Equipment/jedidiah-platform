import { IconChevronDown } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';

export type PageHeaderAction = {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

const widths = {
  '48rem': { buttons: 'hidden @min-[48rem]/page-header:flex', menu: '@min-[48rem]/page-header:hidden' },
  '64rem': { buttons: 'hidden @min-[64rem]/page-header:flex', menu: '@min-[64rem]/page-header:hidden' },
  '80rem': { buttons: 'hidden @min-[80rem]/page-header:flex', menu: '@min-[80rem]/page-header:hidden' },
};

/** Place in PageLayout.actions. Keep action dialogs outside this group so closing the menu cannot unmount them. */
export function PageHeaderActions({
  actions,
  collapseBelow = '64rem',
  title,
}: {
  actions: readonly PageHeaderAction[];
  collapseBelow?: keyof typeof widths;
  title: string;
}) {
  if (actions.length === 0) return null;
  const classes = widths[collapseBelow];

  return (
    <>
      <div className={`${classes.buttons} flex-wrap items-center gap-2`}>
        {actions.map((action) => (
          <Button key={action.label} disabled={action.disabled} onClick={action.onClick} variant="outline">
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
      <div className={classes.menu}>
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
      </div>
    </>
  );
}
