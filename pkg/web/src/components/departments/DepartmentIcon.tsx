import type { Department } from '@pkg/schema';
import type React from 'react';

import { AssemblyDepartmentIcon } from './AssemblyDepartmentIcon.js';
import { FabricationDepartmentIcon } from './FabricationDepartmentIcon.js';
import { PaintDepartmentIcon } from './PaintDepartmentIcon.js';
import { ProcurementDepartmentIcon } from './ProcurementDepartmentIcon.js';
import { SupplyDepartmentIcon } from './SupplyDepartmentIcon.js';

type DepartmentIconProps = {
  department: Department;
} & React.ComponentProps<typeof AssemblyDepartmentIcon>;

export function DepartmentIcon({ department, ...props }: DepartmentIconProps) {
  switch (department) {
    case 'assembly':
      return <AssemblyDepartmentIcon {...props} />;
    case 'fabrication':
      return <FabricationDepartmentIcon {...props} />;
    case 'paint':
      return <PaintDepartmentIcon {...props} />;
    case 'procurement':
      return <ProcurementDepartmentIcon {...props} />;
    case 'supply':
      return <SupplyDepartmentIcon {...props} />;
  }
}
