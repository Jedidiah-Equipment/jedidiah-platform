export function unwrapAuthResult<TData>(result: unknown): TData {
  if (!isRecord(result)) {
    throw new Error("User update failed.");
  }

  if (isRecord(result.error)) {
    throw new Error(getAuthErrorMessage(result.error));
  }

  if (result.data === null || result.data === undefined) {
    throw new Error("User update failed.");
  }

  return result.data as TData;
}

function getAuthErrorMessage(error: Record<string, unknown>): string {
  return typeof error.message === "string" && error.message.length > 0
    ? error.message
    : "User update failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
