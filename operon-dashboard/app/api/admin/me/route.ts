import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';

/**
 * GET /api/admin/me
 * Thin endpoint used by the client to check whether the current session
 * belongs to an allowlisted admin wallet. Returns { isAdmin: true, wallet }
 * on success; the underlying `requireAdmin()` returns 401/403/503 otherwise,
 * which the client treats as "not admin" (for non-200, hide the nav link).
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json({ isAdmin: true, wallet: admin.wallet });
}
