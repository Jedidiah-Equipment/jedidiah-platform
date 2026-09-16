import {
  IconBuilding,
  IconCategory,
  IconClipboardList,
  IconCoins,
  IconGauge,
  IconRuler2,
  IconTools,
  IconTractor,
  IconUsers,
} from '@tabler/icons-react';
import { linkOptions } from '@tanstack/react-router';

import type { NavSection } from '@/components/app-shell/NavSections.js';

const isCategoriesPath = (pathname: string) => pathname.startsWith('/contracting/fleet/categories');

/** Categories live under the fleet routes but own an Admin nav item, so Fleet must not claim them. */
export const isFleetNavPath = (pathname: string) =>
  pathname.startsWith('/contracting/fleet') && !isCategoriesPath(pathname);

export const isImplementsNavPath = (pathname: string) => pathname.startsWith('/contracting/fleet/implements');

export const isMachinesNavPath = (pathname: string) => isFleetNavPath(pathname) && !isImplementsNavPath(pathname);

export const contractingNavSections = [
  {
    label: '',
    items: [
      {
        title: 'Dashboard',
        link: linkOptions({ activeOptions: { exact: true }, to: '/contracting' }),
        icon: IconGauge,
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        title: 'Fleet',
        permission: 'contracting_machine:read',
        link: linkOptions({ to: '/contracting/fleet' }),
        icon: IconTractor,
        isActive: isFleetNavPath,
        children: [
          { title: 'Machines', link: linkOptions({ to: '/contracting/fleet' }), isActive: isMachinesNavPath },
          {
            title: 'Implements',
            link: linkOptions({ to: '/contracting/fleet/implements' }),
            isActive: isImplementsNavPath,
          },
        ],
      },
      {
        title: 'Reading exceptions',
        permission: 'contracting_reading:update',
        link: linkOptions({ to: '/contracting/readings/exceptions' }),
        icon: IconGauge,
      },
      {
        title: 'Customers',
        permission: 'contracting_directory:read',
        link: linkOptions({ to: '/contracting/customers' }),
        icon: IconBuilding,
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        title: 'Users',
        permission: 'user:list',
        link: linkOptions({ to: '/contracting/users' }),
        icon: IconUsers,
      },
      {
        title: 'Categories',
        permission: 'contracting_machine:read',
        link: linkOptions({ to: '/contracting/fleet/categories' }),
        icon: IconCategory,
      },
      {
        title: 'Work types',
        permission: 'contracting_directory:read',
        link: linkOptions({ to: '/contracting/work-types' }),
        icon: IconTools,
      },
      {
        title: 'Rate Card',
        permission: 'contracting_rate:read',
        link: linkOptions({ to: '/contracting/rates' }),
        icon: IconCoins,
      },
      {
        title: 'Measure Types',
        permission: 'contracting_rate:read',
        link: linkOptions({ to: '/contracting/measure-types' }),
        icon: IconRuler2,
      },
      {
        title: 'Audit',
        permission: 'contracting_audit:read',
        link: linkOptions({ to: '/contracting/audit' }),
        icon: IconClipboardList,
      },
    ],
  },
] as const satisfies readonly NavSection[];
