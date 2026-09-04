import { byBayDepartmentPipeline } from '@pkg/domain/equipment';
import type { Bay } from '@pkg/schema/equipment';

export function sortBaysByDepartmentPipeline<T extends Pick<Bay, 'department' | 'name'>>(bays: T[]): T[] {
  return [...bays].sort(byBayDepartmentPipeline);
}
