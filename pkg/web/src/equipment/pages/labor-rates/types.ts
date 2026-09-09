import { departmentLabels } from '@pkg/domain/equipment';
import { LaborRateCardUpdateInput, WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';

const fieldLabels: Record<string, string> = {
  billingRate: 'Billing rate',
  costToCompanyRate: 'Cost to company',
  consumablesPercentage: 'Consumables',
  hoursPerWorkingDay: 'Hours per working day',
  managementOverheadPercentage: 'Management overhead',
};

export function parseLaborRateForm(data: FormData) {
  const number = (key: string) => {
    // An absent input is a broken/incomplete form, not an intentional clearing of a rate.
    if (!data.has(key)) return undefined;
    const value = String(data.get(key)).trim();
    return value === '' ? null : Number(value);
  };
  return LaborRateCardUpdateInput.safeParse({
    hoursPerWorkingDay: number('hoursPerWorkingDay'),
    managementOverheadPercentage: number('managementOverheadPercentage'),
    rates: WORK_ITEM_DEPARTMENTS.map((department) => ({
      department,
      billingRate: number(`${department}.billingRate`),
      costToCompanyRate: number(`${department}.costToCompanyRate`),
      consumablesPercentage: number(`${department}.consumablesPercentage`),
    })),
  });
}

export function laborRateFieldLabel(path: readonly PropertyKey[]): string {
  const field = String(path.at(-1));
  const department = path[0] === 'rates' && typeof path[1] === 'number' ? WORK_ITEM_DEPARTMENTS[path[1]] : undefined;
  return `${department ? `${departmentLabels[department]} — ` : ''}${fieldLabels[field] ?? 'Labor rates'}`;
}
