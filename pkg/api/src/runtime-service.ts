/** A background worker the server starts once its routes are up and stops on close. */
export type RuntimeService = {
  start?: () => void;
  dispose: () => Promise<void> | void;
};
