import { AuthRequest } from '../middlewares/authMiddleware';

/**
 * Resolve the active project id for a request.
 * The frontend attaches it via the `X-Project-Id` header (see axios interceptor),
 * but it may also be supplied as a query param or in the body as a fallback.
 * Returns an empty string when no project scope is present.
 */
export function getProjectId(req: AuthRequest): string {
  const header = req.headers['x-project-id'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  const query = req.query?.projectId;
  if (typeof query === 'string' && query.trim()) {
    return query.trim();
  }
  const body = (req.body as { projectId?: unknown })?.projectId;
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  return '';
}
