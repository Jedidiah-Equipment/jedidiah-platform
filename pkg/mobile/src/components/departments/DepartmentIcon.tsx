import type { Department } from '@pkg/schema';
import {
  IconBrush,
  IconClipboardList,
  IconHammer,
  IconTool,
  IconTools,
  IconTruckDelivery,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';

import { Icon } from '@/components/ui/icon';

// The same glyph per Department as web's src/components/departments, so a Department
// reads identically on the Board and on the floor.
const departmentIcons: Record<Department, TablerIcon> = {
  assembly: IconTool,
  fabrication: IconHammer,
  paint: IconBrush,
  procurement: IconClipboardList,
  supply: IconTruckDelivery,
  workshop: IconTools,
};

export function DepartmentIcon({
  className,
  department,
  size,
}: {
  className?: string;
  department: Department;
  size?: number;
}) {
  return <Icon className={className} icon={departmentIcons[department]} size={size} />;
}
