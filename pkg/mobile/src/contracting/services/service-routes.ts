/** A Service Record's own screen. */
export const serviceRecordHref = (serviceId: string) =>
  ({ pathname: '/contracting/services/[serviceId]', params: { serviceId } }) as const;
