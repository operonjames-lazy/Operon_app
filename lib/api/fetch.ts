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
 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, options);
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
