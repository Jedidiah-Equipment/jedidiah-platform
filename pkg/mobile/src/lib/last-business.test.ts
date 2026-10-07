import type { RoleSlots } from '@pkg/domain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => ({ useFocusEffect: vi.fn() }));
vi.mock('./observability', () => ({ addBreadcrumb: vi.fn() }));

import { readLandingBusiness, rememberBusiness } from './last-business';

const both: RoleSlots = { contractingRole: 'foreman', equipmentRole: 'sales' };
const equipmentOnly: RoleSlots = { contractingRole: null, equipmentRole: 'sales' };
const contractingOnly: RoleSlots = { contractingRole: 'foreman', equipmentRole: null };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('readLandingBusiness', () => {
  test('reopens in the business the phone was last in', async () => {
    await rememberBusiness('contracting');
    expect(await readLandingBusiness(both)).toBe('contracting');

    await rememberBusiness('equipment');
    expect(await readLandingBusiness(both)).toBe('equipment');
  });

  test('falls back to the default business when nothing was remembered', async () => {
    expect(await readLandingBusiness(both)).toBe('equipment');
    expect(await readLandingBusiness(contractingOnly)).toBe('contracting');
  });

  test('ignores a remembered business the user can no longer open', async () => {
    await rememberBusiness('contracting');
    expect(await readLandingBusiness(equipmentOnly)).toBe('equipment');
  });

  test('ignores a stored value that is not a business', async () => {
    await AsyncStorage.setItem('jedidiah-last-business', 'fleet');
    expect(await readLandingBusiness(contractingOnly)).toBe('contracting');
  });

  test('falls back to the default business when the read fails', async () => {
    vi.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(readLandingBusiness(both)).resolves.toBe('equipment');
  });
});
