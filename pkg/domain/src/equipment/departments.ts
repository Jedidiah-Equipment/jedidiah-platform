import type { Department, WorkItemDepartment } from '@pkg/schema';

export const departmentLabels: Record<Department, string> = {
  procurement: 'Procurement',
  supply: 'Supply',
  fabrication: 'Fabrication',
  paint: 'Paint',
  assembly: 'Assembly',
  workshop: 'Workshop',
};

export const departmentShortLabels: Record<Department, string> = {
  procurement: 'Proc',
  supply: 'Supply',
  fabrication: 'Fab',
  paint: 'Paint',
  assembly: 'Asm',
  workshop: 'Wksp',
};

/** Department Crew wording for internal work-time and build-metric surfaces. */
export const departmentCrewLabels: Record<
  WorkItemDepartment,
  { collection: string; plural: string; singular: string }
> = {
  assembly: { collection: 'Assembly crew', plural: 'Crew members', singular: 'Crew member' },
  fabrication: { collection: 'Fabrication crew', plural: 'Crew members', singular: 'Crew member' },
  paint: { collection: 'Paint crew', plural: 'Crew members', singular: 'Crew member' },
  workshop: { collection: 'Workshop crew', plural: 'Crew members', singular: 'Crew member' },
};

/**
 * What the shop calls each Department when quoting, which is not always what it calls it internally —
 * Quote surfaces and customer documents use these labels. Internal surfaces stay on
 * {@link departmentLabels} so the floor sees the Department that owns the bay and the people.
 */
export const quoteDepartmentLabels: Record<Department, string> = {
  procurement: 'Procurement',
  supply: 'Supply',
  fabrication: 'Fabrication',
  paint: 'Paintshop',
  assembly: 'Assembly',
  workshop: 'Workshop',
};
