export class ToolAuthorizationError extends Error {
  constructor(message = "Tool authorization failed") {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}
