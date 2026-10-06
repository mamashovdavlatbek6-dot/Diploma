import { ApiError } from './errors';
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'forbidden', 'Cross-origin requests are not allowed');
}
