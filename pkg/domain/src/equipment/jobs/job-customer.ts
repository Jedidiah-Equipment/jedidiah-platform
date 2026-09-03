/** The minimum a surface needs to name whoever a Job belongs to. */
export type JobCustomerParty = {
  id: string;
  companyName: string;
  thumbnailDataUrl: string | null;
};

export type JobCustomerSource = {
  /**
   * Present when the Job is bound to a Product Unit; `owner` is that machine's current Owner, or
   * `null` when we hold it. Absent for a Custom Job, which produces no machine.
   */
  productUnit: { owner: JobCustomerParty | null } | null;
  quoteCustomer: JobCustomerParty | null;
};

/**
 * Who a Job belongs to. A Job bound to a Product Unit follows that machine's current Owner — not the
 * Quote that first built it, which is what lets a sold-on machine show its new Customer. A Custom Job
 * produces no machine, so it follows its Quote. `null` means Stock: we hold it.
 */
export function resolveJobCustomer({ productUnit, quoteCustomer }: JobCustomerSource): JobCustomerParty | null {
  return productUnit ? productUnit.owner : quoteCustomer;
}
