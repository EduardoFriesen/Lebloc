import type { ApiError, ApiInput, ApiOutputs } from '../../shared/api';
import type { Channel } from '../../shared/channels';

export class ApiCallError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiCallError';
    this.code = error.code;
    this.details = error.details;
  }
}

export async function call<C extends Channel>(channel: C, input: ApiInput<C>): Promise<ApiOutputs[C]> {
  const result = await window.lebloc.invoke(channel, input);
  if (!result.success) throw new ApiCallError(result.error);
  return result.data;
}
