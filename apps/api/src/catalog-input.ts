import { BadRequestException } from '@nestjs/common';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function invalid(): never { throw new BadRequestException({ status: 'invalid_request' }); }
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid();
  return value.toLowerCase();
}
export function integer(value: unknown, minimum = 0, maximum = 2147483647): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) invalid();
  return value;
}
export function text(value: unknown, maximum: number, required: boolean): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())
    || [...value].some(char => char.charCodeAt(0) === 127 || (char.charCodeAt(0) < 32 && (required || !['\n','\r','\t'].includes(char))))) invalid();
  return required ? value.trim() : value;
}
export function fields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !allowed.includes(key))) invalid();
  return value as Record<string, unknown>;
}
