import { byBayDepartmentPipeline } from '@pkg/domain';
import type { Bay } from '@pkg/schema';

export function sortBaysByDepartmentPipeline<T extends Pick<Bay, 'department' | 'name'>>(bays: T[]): T[] {
  return [...bays].sort(byBayDepartmentPipeline);
}
