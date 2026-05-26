import { type AppRole, type Department, UserPassword } from '@pkg/schema';

export type DemoUser = {
  departments: readonly Department[];
  email: string;
  id: string;
  name: string;
  password: UserPassword;
  role: AppRole;
};

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
] as const satisfies readonly DemoUser[];

function createDemoUserEmail(name: string): string {
  return `${name.split(' ')[0]?.toLowerCase()}@j.com`;
}
