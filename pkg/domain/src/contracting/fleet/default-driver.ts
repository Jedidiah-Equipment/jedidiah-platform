/** The field naming a Machine's default Driver, the one filled in each time it is added to a Job. */
export const DEFAULT_DRIVER_LABEL = 'Default Driver';

/** The Driver picker's empty choice, which keeps the Machine's default Driver, naming them when known. */
export const machineDefaultDriverChoice = (driverName?: string | null) =>
  driverName ? `Machine's default Driver · ${driverName}` : "Machine's default Driver";
