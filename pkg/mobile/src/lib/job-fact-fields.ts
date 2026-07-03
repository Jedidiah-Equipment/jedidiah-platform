export type JobWorkFactFieldsInput = {
  workName: string;
  productSerialNumber: string | null;
};

export type JobFactField = {
  label: string;
  value: string;
  mono?: boolean;
};

export function getJobWorkFactFields({ workName, productSerialNumber }: JobWorkFactFieldsInput): JobFactField[] {
  const fields: JobFactField[] = [{ label: 'WORK', value: workName }];
  if (productSerialNumber) fields.push({ label: 'PRODUCT SERIAL', mono: true, value: productSerialNumber });

  return fields;
}
