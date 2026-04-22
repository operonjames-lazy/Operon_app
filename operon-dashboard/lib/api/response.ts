export function apiError(code: string, message: string, status: number = 500) {
  return Response.json({ code, message }, { status });
}

export const ApiErrors = {
  unauthorized: (msg = 'Not authenticated') => apiError('UNAUTHORIZED', msg, 401),
  badRequest: (msg: string) => apiError('BAD_REQUEST', msg, 400),
  notFound: (msg = 'Not found') => apiError('NOT_FOUND', msg, 404),
  rateLimited: (msg = 'Too many requests') => apiError('RATE_LIMITED', msg, 429),
  internal: (msg = 'Internal server error') => apiError('INTERNAL_ERROR', msg, 500),
};
