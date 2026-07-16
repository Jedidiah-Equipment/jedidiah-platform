import type { JobDetail } from '@pkg/schema';

export type JobAssemblyAndLineItemRow = {
  key: string;
  kind: JobDetail['cfo'][number]['kind'] | 'custom';
  name: string;
};

export function getJobAssemblyAndLineItemRows({
  cfo,
  lineItems,
}: Pick<JobDetail, 'cfo' | 'lineItems'>): JobAssemblyAndLineItemRow[] {
  const customRows = lineItems.map(
    (item): JobAssemblyAndLineItemRow => ({
      key: `custom-${item.id}`,
      kind: 'custom',
      name: item.name,
    }),
  );
  const assemblyRows = (kind: JobDetail['cfo'][number]['kind']) =>
    cfo
      .filter((assembly) => assembly.kind === kind)
      .map(
        (assembly): JobAssemblyAndLineItemRow => ({
          key: `${kind}-${assembly.assemblyName}`,
          kind,
          name: assembly.assemblyName,
        }),
      );

  return [...customRows, ...assemblyRows('optional'), ...assemblyRows('standard')];
}
