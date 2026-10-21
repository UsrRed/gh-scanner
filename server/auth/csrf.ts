import { timingSafeEqual } from 'node:crypto';

export const CSRF_HEADER = 'x-csrf-token';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export const isMutation = (method: string): boolean => !SAFE.has(method.toUpperCase());

export function csrfValid(expected: string, given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
