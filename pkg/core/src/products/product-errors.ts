export class DuplicateProductNameError extends Error {
  constructor(name: string) {
    super(`Product name already exists: ${name}`);
    this.name = 'DuplicateProductNameError';
  }
}

export class DuplicateProductModelCodeError extends Error {
  constructor(modelCode: string) {
    super(`Product model code already exists: ${modelCode}`);
    this.name = 'DuplicateProductModelCodeError';
  }
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product not found: ${id}`);
    this.name = 'ProductNotFoundError';
  }
}

export class DuplicateProductOptionCodeError extends Error {
  constructor(code: string) {
    super(`Product option code already exists: ${code}`);
    this.name = 'DuplicateProductOptionCodeError';
  }
}

export class ProductOptionNotFoundError extends Error {
  constructor(id: string) {
    super(`Product option not found: ${id}`);
    this.name = 'ProductOptionNotFoundError';
  }
}
