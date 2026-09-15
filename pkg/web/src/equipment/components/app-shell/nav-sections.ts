import {
  IconBriefcase2,
  IconBuilding,
  IconBuildingWarehouse,
  IconCategory2,
  IconClipboardCheck,
  IconClipboardList,
  IconCoins,
  IconFileText,
  IconFlagCheck,
  IconGauge,
  IconHeartHandshake,
  IconLanguage,
  IconLayoutKanban,
  IconMessageReport,
  IconPackages,
  IconReceipt2,
  IconShoppingCart,
  IconShoppingCartPlus,
  IconTool,
  IconUsers,
} from '@tabler/icons-react';
import { linkOptions } from '@tanstack/react-router';

import type { NavSection } from '@/components/app-shell/NavSections.js';
import {
  ActivityUnreadNavIndicator,
  BuyListSignalNavIndicator,
  FeedbackOpenNavIndicator,
  QuotesPriorityNavIndicator,
  ReturnsAwaitingCreditNavIndicator,
  StocktakeOverdueNavIndicator,
} from './AppNavIndicators.js';

export const equipmentNavSections = [
  {
    label: '',
    items: [
      {
        title: 'Dashboard',
        link: linkOptions({ to: '/equipment/dashboard' }),
        icon: IconGauge,
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        title: 'Quotes',
        permission: 'equipment_quote:read',
        link: linkOptions({ to: '/equipment/quotes' }),
        icon: IconFileText,
        indicator: QuotesPriorityNavIndicator,
      },
      {
        title: 'Jobs',
        permission: 'equipment_job:read',
        link: linkOptions({ to: '/equipment/jobs' }),
        icon: IconBriefcase2,
        indicator: ActivityUnreadNavIndicator,
        children: [
          {
            title: 'Planning',
            permission: 'equipment_job:read',
            link: linkOptions({ to: '/equipment/jobs' }),
          },
          {
            title: 'List',
            permission: 'equipment_job:read',
            link: linkOptions({ to: '/equipment/jobs/list' }),
          },
          {
            title: 'Activity',
            permission: 'equipment_job:read',
            link: linkOptions({ to: '/equipment/jobs/activity' }),
            indicator: ActivityUnreadNavIndicator,
          },
          {
            title: 'Calendar',
            permission: 'equipment_job:read',
            link: linkOptions({ to: '/equipment/jobs/calendar' }),
          },
        ],
      },
      {
        title: 'Units',
        permission: 'equipment_product_unit:read',
        link: linkOptions({ to: '/equipment/units' }),
        icon: IconBuildingWarehouse,
      },
      {
        title: 'Customers',
        permission: 'equipment_customer:read',
        link: linkOptions({ to: '/equipment/customers' }),
        icon: IconBuilding,
      },
      {
        title: 'Products',
        permission: 'equipment_product:read',
        link: linkOptions({ to: '/equipment/products' }),
        icon: IconPackages,
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        title: 'Suppliers',
        permission: 'equipment_supplier:read',
        link: linkOptions({ to: '/equipment/suppliers' }),
        icon: IconHeartHandshake,
      },
      {
        title: 'Parts',
        permission: 'equipment_part:read',
        link: linkOptions({ to: '/equipment/parts' }),
        icon: IconTool,
      },
      {
        title: 'Inventory',
        permission: 'equipment_inventory:read',
        link: linkOptions({ activeOptions: { exact: true }, to: '/equipment/inventory' }),
        icon: IconBuildingWarehouse,
        isActive: isInventoryNavPath,
      },
      {
        title: 'Buy list',
        permission: 'equipment_inventory:read',
        link: linkOptions({ to: '/equipment/inventory/buy-list' }),
        icon: IconShoppingCartPlus,
        indicator: BuyListSignalNavIndicator,
      },
      {
        title: 'Purchase Orders',
        permission: 'equipment_purchase_order:read',
        link: linkOptions({ to: '/equipment/purchase-orders' }),
        icon: IconShoppingCart,
        indicator: ReturnsAwaitingCreditNavIndicator,
      },
      {
        title: 'PO vs invoiced',
        permission: 'equipment_inventory_cost:read',
        link: linkOptions({ to: '/equipment/inventory/price-variance' }),
        icon: IconReceipt2,
      },
      {
        title: 'Stocktake',
        permission: 'equipment_inventory:read',
        link: linkOptions({ to: '/equipment/inventory/stocktake' }),
        icon: IconClipboardCheck,
        indicator: StocktakeOverdueNavIndicator,
      },
      {
        title: 'Close-out',
        permission: 'equipment_inventory:close-out',
        link: linkOptions({ to: '/equipment/inventory/close-out' }),
        icon: IconFlagCheck,
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        title: 'Bays',
        permission: 'equipment_job_bay:read',
        link: linkOptions({ to: '/equipment/bays' }),
        icon: IconLayoutKanban,
      },
      {
        title: 'Users',
        permission: 'user:list',
        link: linkOptions({ to: '/equipment/users' }),
        icon: IconUsers,
      },
      {
        title: 'Labor rates',
        permission: 'equipment_labor_rate:read',
        link: linkOptions({ to: '/equipment/labor-rates' }),
        icon: IconCoins,
      },
      {
        title: 'Product Ranges',
        permission: 'equipment_product_range:read',
        link: linkOptions({ to: '/equipment/product-ranges' }),
        icon: IconCategory2,
      },
      {
        title: 'Translations',
        permission: 'equipment_product_range:update',
        link: linkOptions({ to: '/equipment/catalog-translations' }),
        icon: IconLanguage,
      },
      {
        title: 'Feedback',
        permission: 'equipment_feedback:read',
        link: linkOptions({ to: '/equipment/feedback' }),
        icon: IconMessageReport,
        indicator: FeedbackOpenNavIndicator,
      },
      {
        title: 'Audit',
        permission: 'equipment_audit:read',
        link: linkOptions({ to: '/equipment/audit' }),
        icon: IconClipboardList,
      },
    ],
  },
] as const satisfies readonly NavSection[];

/** Inventory routes that are their own nav item, so the Part-history match must not claim them. */
const inventorySiblingRoutes = [
  '/equipment/inventory/buy-list',
  '/equipment/inventory/close-out',
  '/equipment/inventory/price-variance',
  '/equipment/inventory/stocktake',
];

export function isInventoryNavPath(pathname: string): boolean {
  if (inventorySiblingRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return false;
  }

  return pathname === '/equipment/inventory' || /^\/equipment\/inventory\/[^/]+\/?$/.test(pathname);
}
