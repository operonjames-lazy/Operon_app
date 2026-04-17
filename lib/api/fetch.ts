/**
 * Auth-aware fetch helpers.
 *
 * JWT is stored in an httpOnly cookie (operon_session) set by /api/auth/wallet.
 * A non-httpOnly flag cookie (operon_auth=1) lets client JS check if a session exists.
 * The browser sends both cookies automatically on same-origin requests.
 */

/** Check if a session cookie exists (does NOT validate the JWT). */
export function isAuthenticated(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes('operon_auth=1');
}

/** Clear the auth session by calling the logout endpoint. */
export async function clearSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Best-effort — cookies may also expire naturally
  }
}

/**
 * Fetch wrapper for authenticated API calls.
 * Cookies are sent automatically by the browser for same-origin requests.
 *
 * Ship-readiness R5: on any 401, fire a window event so `useAuth` can
 * tear down the local authed-session flag and re-run SIWE. Without this,
 * a stale cookie (JWT_SECRET rotated, server-side logout, token expiry)
 * leaves the UI "authenticated" while every authed query returns 401 and
 * falls into the page-level error state with no recovery path.
 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401 && typeof window !== 'undefined') {
    // Dispatch once per 401; useAuth listens and resets state.
    window.dispatchEvent(new CustomEvent('operon:auth-expired', { detail: { url } }));
  }
  return res;
}

// Legacy exports — kept for backward compatibility during migration.
// getAuthToken returns a truthy string if authenticated (cookie-based).
export function getAuthToken(): string | null {
  return isAuthenticated() ? 'cookie-session' : null;
}
export function setAuthToken(_token: string): void {
  // No-op: token is now set via httpOnly cookie by the server
}
export function clearAuthToken(): void {
  // No-op: use clearSession() instead (async, calls /api/auth/logout)
}
