import { type AppRole, DEPARTMENTS, type Department, UserPassword } from '@pkg/schema';

export type DemoUser = {
  departments: readonly Department[];
  email: string;
  id: string;
  name: string;
  password: UserPassword;
  role: AppRole;
};

const demoJobStageEditors = {
  assembly: 'Max',
  dispatch: 'Sam',
  fabrication: 'Ben',
  paint: 'Eli',
  procurement: 'Dan',
} as const satisfies Record<Department, string>;

export const DEFAULT_DEMO_USER_PASSWORD: UserPassword = UserPassword.parse('123');

export const demoUsers = [
  {
    departments: [],
    id: 'seed-admin-user',
    name: 'Tom',
    email: createDemoUserEmail('Tom'),
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'admin',
  },
  {
    departments: [],
    id: 'seed-product-editor-user',
    name: 'Joe',
    email: createDemoUserEmail('Joe'),
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'product-editor',
  },
  {
    departments: [],
    id: 'seed-product-viewer-user',
    name: 'Leo',
    email: createDemoUserEmail('Leo'),
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'product-viewer',
  },
  {
    departments: [],
    id: 'seed-job-supervisor-user',
    name: 'Ray',
    email: createDemoUserEmail('Ray'),
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'job-supervisor',
  },
  ...DEPARTMENTS.map(
    (department): DemoUser => ({
      departments: [department],
      id: `seed-job-stage-editor-${department}-user`,
      name: demoJobStageEditors[department],
      email: createDemoUserEmail(demoJobStageEditors[department]),
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: 'job-stage-editor',
    }),
  ),
] as const satisfies readonly DemoUser[];

function createDemoUserEmail(name: string): string {
  return `${name.split(' ')[0]?.toLowerCase()}@j.com`;
}
