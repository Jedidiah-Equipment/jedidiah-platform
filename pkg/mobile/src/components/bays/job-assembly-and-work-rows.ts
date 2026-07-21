import type { JobDetail } from '@pkg/schema';

export type JobAssemblyAndWorkRow = {
  key: string;
  kind: JobDetail['cfo'][number]['kind'] | 'custom';
  name: string;
};

export function getJobAssemblyAndWorkRows({
  cfo,
  workRows,
}: Pick<JobDetail, 'cfo' | 'workRows'>): JobAssemblyAndWorkRow[] {
  const customRows = workRows.map(
    (item): JobAssemblyAndWorkRow => ({
      key: `custom-${item.id}`,
      kind: 'custom',
      name: item.name,
    }),
  );
  const assemblyRows = (kind: JobDetail['cfo'][number]['kind']) =>
    cfo
      .filter((assembly) => assembly.kind === kind)
      .map(
        (assembly): JobAssemblyAndWorkRow => ({
          key: `${kind}-${assembly.assemblyName}`,
          kind,
          name: assembly.assemblyName,
        }),
      );

  return [...customRows, ...assemblyRows('optional'), ...assemblyRows('standard')];
}
