import { activityPermissions } from '@pkg/domain/contracting';
import {
  IconActivity,
  IconBuilding,
  IconCategory,
  IconChartBar,
  IconClipboardCheck,
  IconClipboardList,
  IconCoins,
  IconEngine,
  IconGauge,
  IconMicrophone,
  IconReceipt,
  IconRuler2,
  IconSettings,
  IconTool,
  IconTools,
  IconTractor,
  IconUsers,
} from '@tabler/icons-react';
import { linkOptions } from '@tanstack/react-router';
import type { NavSection } from '@/components/app-shell/NavSections.js';
import { ActivityUnreadNavIndicator, ServicesNavIndicator, WorkshopNavIndicator } from './AppNavIndicators.js';

const isCategoriesPath = (pathname: string) => pathname.startsWith('/contracting/fleet/categories');

/** Categories live under the fleet routes but own an Admin nav item, so Fleet must not claim them. */
export const isFleetNavPath = (pathname: string) =>
  pathname.startsWith('/contracting/fleet') && !isCategoriesPath(pathname);

export const isImplementsNavPath = (pathname: string) => pathname.startsWith('/contracting/fleet/implements');

export const isWorkshopNavPath = (pathname: string) => pathname.startsWith('/contracting/workshop');

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
      {
        title: 'Activity',
        permissionAnyOf: activityPermissions,
        link: linkOptions({ to: '/contracting/activity' }),
        icon: IconActivity,
        indicator: ActivityUnreadNavIndicator,
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        title: 'Jobs',
        permission: 'contracting_job:read',
        link: linkOptions({ to: '/contracting/jobs' }),
        icon: IconClipboardCheck,
      },
      {
        title: 'Invoicing',
        permission: 'contracting_job:read-priced',
        link: linkOptions({ to: '/contracting/invoicing' }),
        icon: IconReceipt,
      },
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
        title: 'Workshop',
        permission: 'contracting_breakdown:read',
        link: linkOptions({ to: '/contracting/workshop' }),
        icon: IconTool,
        isActive: isWorkshopNavPath,
        indicator: WorkshopNavIndicator,
      },
      {
        title: 'Services',
        permission: 'contracting_service:read',
        link: linkOptions({ to: '/contracting/services' }),
        icon: IconEngine,
        indicator: ServicesNavIndicator,
      },
      {
        title: 'Customers',
        permission: 'contracting_directory:read',
        link: linkOptions({ to: '/contracting/customers' }),
        icon: IconBuilding,
      },
      {
        title: 'Reports',
        permission: 'contracting_report:read',
        link: linkOptions({ to: '/contracting/reports' }),
        icon: IconChartBar,
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
        title: 'Transcriptions',
        permission: 'contracting_transcription:read',
        link: linkOptions({ to: '/contracting/transcriptions' }),
        icon: IconMicrophone,
      },
      {
        title: 'Settings',
        permission: 'contracting_settings:update',
        link: linkOptions({ to: '/contracting/settings' }),
        icon: IconSettings,
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
