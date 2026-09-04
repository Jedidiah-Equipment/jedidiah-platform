import type { ContractingRole, EquipmentRole, UserPassword } from '@pkg/schema';
import type { Department } from '@pkg/schema/equipment';

import { DEFAULT_DEMO_USER_PASSWORD } from '../demo.js';

export type DemoUser = {
  contractingRole?: ContractingRole;
  departments: readonly Department[];
  email: string;
  id: string;
  /** A shared machine rather than a person — the stores tablet. Defaults to false when omitted. */
  isDevice?: boolean;
  name: string;
  password: UserPassword;
  equipmentRole: EquipmentRole;
};

export const demoUsers: readonly DemoUser[] = [
  {
    departments: [],
    id: 'seed-dean-user',
    name: 'Dean van Niekerk',
    email: 'dean@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'super-admin',
  },
  {
    contractingRole: 'contracting-admin',
    departments: [],
    id: 'seed-reinhard-user',
    name: 'Reinhard Zellhuber',
    email: 'design@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'admin',
  },
  {
    departments: [],
    id: 'seed-jed-user',
    name: 'Jed van Niekerk',
    email: 'jed@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'super-admin',
  },
  {
    departments: [],
    id: 'seed-operator-fabrication-user',
    name: 'Fabrication Bay Operator',
    email: 'fabrication.operator@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'bay-operator',
  },
  {
    departments: [],
    id: 'seed-operator-assembly-user',
    name: 'Assembly Bay Operator',
    email: 'assembly.operator@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'bay-operator',
  },
  // The stores tablet and two people to quick-switch between. Without all three a fresh seed leaves
  // every device rule inert and the tablet impossible to exercise — the flag only bites when some
  // account carries it, and the quick-switch grid is empty without stores people to offer.
  {
    departments: [],
    id: 'seed-stores-tablet',
    isDevice: true,
    name: 'Stores Tablet',
    email: 'stores.tablet@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'stores',
  },
  {
    departments: [],
    id: 'seed-stores-first-user',
    name: 'Stores Person One',
    email: 'stores.one@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'stores',
  },
  {
    departments: [],
    id: 'seed-stores-second-user',
    name: 'Stores Person Two',
    email: 'stores.two@jedidiahequipment.co.za',
    password: DEFAULT_DEMO_USER_PASSWORD,
    equipmentRole: 'stores',
  },
];
