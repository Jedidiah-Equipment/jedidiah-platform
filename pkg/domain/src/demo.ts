import { type AppRole, type Department, UserPassword } from '@pkg/schema';

type DemoUser = {
  departments: readonly Department[];
  email: string;
  id: string;
  name: string;
  password: UserPassword;
  role: AppRole;
};

export const DEFAULT_DEMO_USER_PASSWORD: UserPassword = UserPassword.parse('stoneybrook');

export const demoUsers = [
  {
    departments: [],
    id: 'seed-dean-user',
    name: 'Dean van Niekerk',
    email: 'dean@vanniekerk.online',
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'admin',
  },
  {
    departments: [],
    id: 'seed-reinhard-user',
    name: 'Reinhard Zellhuber',
    email: 'design@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'admin',
  },
  {
    departments: [],
    id: 'seed-jed-user',
    name: 'Jed van Niekerk',
    email: 'jed@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'admin',
  },
  {
    departments: [],
    id: 'seed-sue-user',
    name: 'Sue Smith',
    email: 'sales@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'sales',
  },
] as const satisfies readonly DemoUser[];
