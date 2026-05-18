export type AppCode = `${string}.${string}`;

export type ApiErrorShape = {
  data?: {
    appCode?: unknown;
    code?: unknown;
  };
  message?: unknown;
};
