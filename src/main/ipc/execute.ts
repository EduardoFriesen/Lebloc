import { ZodError } from 'zod';
import { DomainError } from '../../domain/errors';
import { apiSchemas, type ApiError, type ApiOutputs, type ApiParsedInput, type ApiResult } from '../../shared/api';
import type { Channel } from '../../shared/channels';

export type Handlers = {
  [C in Channel]: (input: ApiParsedInput<C>) => ApiOutputs[C] | Promise<ApiOutputs[C]>;
};

export type ErrorLogger = (error: unknown) => void;

const INTERNAL_ERROR: ApiError = {
  code: 'INTERNAL_ERROR',
  message: 'Ocurrió un error inesperado. Si se repite, revisá el log de la aplicación.',
};

export function toApiError(error: unknown, logError: ErrorLogger): ApiError {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Hay datos inválidos en el formulario.',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  logError(error);
  return INTERNAL_ERROR;
}

export async function execute<C extends Channel>(
  channel: C,
  rawInput: unknown,
  handlers: Handlers,
  logError: ErrorLogger,
): Promise<ApiResult<ApiOutputs[C]>> {
  try {
    const input = apiSchemas[channel].parse(rawInput);
    // The mapped Handlers type ties each channel to its handler; TypeScript cannot
    // correlate the generic channel with the union of handlers, hence the cast.
    const handler = handlers[channel] as (input: unknown) => ApiOutputs[C] | Promise<ApiOutputs[C]>;
    return { success: true, data: await handler(input) };
  } catch (error) {
    return { success: false, error: toApiError(error, logError) };
  }
}
