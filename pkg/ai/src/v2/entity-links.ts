import { z } from 'zod';

const APP_ORIGIN = 'https://app.invalid';

export type InternalAppHref = z.infer<typeof InternalAppHref>;
export const InternalAppHref = z.string().refine(isInternalAppHref, 'Expected an internal absolute-path link');

export function createProductAppHref(productId: string): InternalAppHref {
  return InternalAppHref.parse(`/products/${productId}/edit`);
}

function isInternalAppHref(href: string): boolean {
  if (!href.startsWith('/') || href.includes('\\') || [...href].some(isControlCharacter)) {
    return false;
  }

  try {
    return new URL(href, APP_ORIGIN).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
}
