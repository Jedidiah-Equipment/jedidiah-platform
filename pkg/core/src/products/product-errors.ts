export class DuplicateProductNameError extends Error {
  constructor(name: string) {
    super(`Product name already exists: ${name}`);
    this.name = "DuplicateProductNameError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product not found: ${id}`);
    this.name = "ProductNotFoundError";
  }
}
