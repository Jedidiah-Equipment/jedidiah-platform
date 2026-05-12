export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = "UserNotFoundError";
  }
}

export class CannotRemoveLastAdminError extends Error {
  constructor() {
    super("Cannot remove the last admin");
    this.name = "CannotRemoveLastAdminError";
  }
}
