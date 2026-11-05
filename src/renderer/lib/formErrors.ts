import type { z } from 'zod';

export type FieldErrors = Partial<Record<string, string>>;

export const MONEY_ERROR = 'Ingresá un monto válido, por ejemplo 15.000,50.';

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
