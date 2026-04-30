'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount, useAccountEffect, useSignMessage } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { SiweMessage } from 'siwe';
import { isAuthenticated as checkCookie, clearSession } from '@/lib/api/fetch';
import { useReferralCodeStore } from '@/stores/referral-code';

/**
 * Auth orchestration hook.
 * Bridges RainbowKit wallet connection with SIWE JWT authentication.
 *
 * Flow:
 * 1. User connects wallet via RainbowKit → useAccount detects address
 * 2. This hook fetches a nonce from /api/auth/nonce
 * 3. Prompts user to sign a SIWE message (via MetaMask)
 * 4. Sends signed message to /api/auth/wallet → server sets httpOnly cookie
 * 5. All subsequent fetch() calls send the cookie automatically
 * 6. On disconnect, calls /api/auth/logout to clear cookies
 */

export function useAuth() {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [isAuthed, setIsAuthed] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const pendingReferralCode = useReferralCodeStore((s) => s.pendingCode);
  const clearPendingReferralCode = useReferralCodeStore((s) => s.clearPendingCode);

  // Track the last address we actually authenticated for, so a MetaMask
  // account switch while connected is detected and forces a full re-auth.
  // Without this, switching accounts in MetaMask leaves the server cookie
  // encoding wallet A while the UI fetches wallet B's data under wallet A's
  // session — the cross-wallet data bleed from bug #10, relocated.
  const authedAddressRef = useRef<string | null>(null);
  // True until the first time the connect-effect runs with a real address.
  // On the very first run, we'll trust an existing session cookie if one is
  // present (avoids the "re-sign on every tab reload" friction from bug #9).
  // On every subsequent run we never adopt a cookie — we either keep the
  // session we already tracked or force a fresh SIWE. This makes the
  // switch-clear → re-auth path immune to the (async) `clearSession` cookie
  // removal racing the next render.
  const initialMountRef = useRef(true);

  // `authenticate` is declared up here (instead of after the effects that
  // call it) so the React Compiler's TDZ rule doesn't fire on the closures
  // below. Functionally the order doesn't change runtime behaviour — effect
  // bodies run after render, by which time the const initialiser has
  // already executed — but the compiler analysis is order-sensitive.
  const authenticate = useCallback(async () => {
    if (!address || !chainId) return;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // 1. Fetch nonce
      const nonceRes = await fetch('/api/auth/nonce');
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { nonce } = await nonceRes.json();

      // 2. Create SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Operon Dashboard',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const messageStr = message.prepareMessage();

      // 3. Sign message
      const signature = await signMessageAsync({ message: messageStr });

      // 4. Send to backend — server sets httpOnly cookie in response
      const authRes = await fetch('/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          message: messageStr,
          signature,
          referralCode: pendingReferralCode || undefined,
        }),
      });

      if (!authRes.ok) {
        const err = await authRes.json();
        throw new Error(err.message || 'Authentication failed');
      }

      // 5. Cookie is set by the server response — consume the referral code
      clearPendingReferralCode();
      // R5-BUG-07: any purchase tx that was queued in MetaMask before the
      // browser closed is outside our control — the wallet owns the
      // request queue. Completing SIWE means this is a fresh session, so
      // the stale pending_tx bookkeeping is no longer relevant and should
      // not continue to fire the "pending transaction" recovery banner on
      // the Sale page. Clearing it here is hygiene, not a security gate.
      // See docs/DECISIONS.md D24 for why we cannot cancel the MetaMask
      // request itself.
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      setIsAuthed(true);
      authedAddressRef.current = address.toLowerCase();
      // Ship-readiness R1: on the wallet-switch path above, `clearSession`
      // + `invalidateQueries` run BEFORE SIWE re-completes, so the first
      // round of re-fetches hit 401 and the `retry: 2` cascade lands the
      // referrals/nodes/dashboard pages in their error boundary well
      // before this SIWE authenticate() resolves. The expiry listener
      // (L168) invalidates on 401 but only when `isAuthed` is true —
      // during SIWE it's false, so the stuck-error queries are never
      // re-attempted on their own. Invalidate wallet-scoped keys here,
      // the moment the new cookie is live, so the error-state queries
      // re-fire with the fresh session and the tester never sees the
      // lingering page-level error boundary.
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['nodes'] });
      await queryClient.invalidateQueries({ queryKey: ['referrals'] });
      await queryClient.invalidateQueries({ queryKey: ['sale', 'status'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      // User rejected signature is not an error — they can retry
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setAuthError(null);
      } else {
        setAuthError(msg);
        console.error('Auth error:', msg);
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, chainId, signMessageAsync, pendingReferralCode, clearPendingReferralCode, queryClient]);

  // Merged connect + adopt-cookie + re-auth effect. Deliberately replaces
  // the two-effect shape that shipped earlier in this session: two effects
  // with overlapping deps produced a stale-closure race where the adopt
  // branch and the authenticate branch both fired on the same render,
  // causing a spurious second SIWE prompt on page load.
  useEffect(() => {
    if (!isConnected || !address || isAuthenticating || isAuthed) return;

    if (initialMountRef.current) {
      initialMountRef.current = false;
      if (checkCookie()) {
        // First mount with an existing session cookie. Ship-readiness R5
        // re-review: previously trusted the flag cookie on sight, which
        // meant a stale JWT (secret rotated, server-side logout, 24h
        // expiry) would leave the UI "authenticated" while every authed
        // query returned 401. Now verify with `/api/auth/me` and confirm
        // the JWT's wallet matches the currently-connected address; on
        // any mismatch or 401, clear local flag and fall through to
        // `authenticate()` for a fresh SIWE.
        (async () => {
          try {
            const res = await fetch('/api/auth/me', { cache: 'no-store' });
            if (!res.ok) {
              try { document.cookie = 'operon_auth=; Max-Age=0; Path=/'; } catch {}
              authenticate();
              return;
            }
            const body = (await res.json()) as { wallet?: string };
            if (!body.wallet || body.wallet.toLowerCase() !== address.toLowerCase()) {
              await clearSession();
              try { document.cookie = 'operon_auth=; Max-Age=0; Path=/'; } catch {}
              authenticate();
              return;
            }
            setIsAuthed(true);
            authedAddressRef.current = address.toLowerCase();
          } catch {
            authenticate();
          }
        })();
        return;
      }
    }
    authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, isAuthed]);

  // Detect MetaMask account-switch while connected. Wagmi updates `address`
  // in place without firing onDisconnect, so we compare against the address
  // we last authenticated for and, if different, tear the session down and
  // let the merged effect above re-run SIWE for the new wallet.
  useEffect(() => {
    if (!isConnected || !address || !isAuthed) return;
    const current = address.toLowerCase();
    const prev = authedAddressRef.current;
    if (prev && prev !== current) {
      // R8 ship-readiness: notify hooks with module-local state (e.g.
      // useTierRealtime's `lastEvent`) that wallet identity changed.
      // queryClient.clear() / invalidate handle TanStack cache; this
      // event covers state that lives outside the cache.
      try {
        window.dispatchEvent(new CustomEvent('operon:wallet-changed'));
      } catch {}
      // R4-06 + R8 ship-readiness: await `clearSession` BEFORE flipping
      // `isAuthed` to false, otherwise the merged effect above re-fires
      // `authenticate()` while this IIFE still has the old session POST
      // in flight — auto-sign / mock-connector harnesses turn that race
      // into a deterministic logout-after-login (new cookie issued,
      // then logout deletes it, then every authed query 401s). Setting
      // `isAuthed=false` inside the IIFE after `clearSession()` resolves
      // keeps the merged effect quiescent until we're actually logged
      // out on the server.
      authedAddressRef.current = null;
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      try { localStorage.removeItem('operon_pending_attribution'); } catch {}
      (async () => {
        await clearSession();
        setIsAuthed(false);
        setAuthError(null);
        // Invalidate rather than clear — keeps cache entries mounted so
        // skeletons show, but marks them stale to trigger a refetch for
        // the new wallet. Narrowed to wallet-scoped keys (A6) — public
        // ['sale','tiers'] doesn't depend on wallet and doesn't need
        // invalidation.
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        await queryClient.invalidateQueries({ queryKey: ['nodes'] });
        await queryClient.invalidateQueries({ queryKey: ['referrals'] });
        await queryClient.invalidateQueries({ queryKey: ['sale', 'status'] });
        // Admin queries are not wallet-keyed but still operator-confidential —
        // a wallet flip from one admin to another (or to a non-admin) should
        // not leave the prev wallet's admin data on screen during the
        // layout-level redirect. removeQueries (not invalidate) so the cache
        // entries are dropped entirely.
        await queryClient.removeQueries({ queryKey: ['admin'] });
      })().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, isAuthed]);

  // Clear auth + cached data on REAL disconnect only. useAccountEffect fires
  // onDisconnect exclusively on the connected → disconnected transition, so
  // the brief !isConnected window during wagmi's rehydration on page load
  // no longer wipes the session cookie. Fixes the F5-re-sign bug (#9) and
  // the incognito 401 race (#10).
  useAccountEffect({
    onDisconnect() {
      authedAddressRef.current = null;
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      // R8 ship-readiness: parity with `operon_pending_tx` removal —
      // `operon_pending_attribution` was the same cross-wallet-bleed
      // class the C-P7 fix targeted, but only one of the two markers
      // was wired into the disconnect path.
      try { localStorage.removeItem('operon_pending_attribution'); } catch {}
      // Notify hooks with module-local React state to reset (e.g.
      // useTierRealtime's `lastEvent`).
      try { window.dispatchEvent(new CustomEvent('operon:wallet-changed')); } catch {}
      // R8 ship-readiness re-review: same race-fix shape as the
      // wallet-switch effect above — await `clearSession()` BEFORE
      // flipping `isAuthed`/`authError` so a fast Connect-Different
      // can't have its fresh `Set-Cookie` overwritten by an in-flight
      // logout response. queryClient.clear() and localStorage cleanup
      // can stay synchronous; only the auth-flag flips need to wait.
      (async () => {
        await clearSession();
        queryClient.clear();
        setIsAuthed(false);
        setAuthError(null);
      })().catch(() => {});
    },
  });

  // Ship-readiness R5: listen for 401 events from `authFetch`. A stale
  // session cookie (JWT_SECRET rotated, server-side logout, expiry) would
  // otherwise leave the UI "authenticated" while every authed query fails.
  // Tear down local state + let the merged connect effect re-run SIWE.
  //
  // Re-review fix: await `clearSession()` BEFORE the refetch fan-out.
  // Mirrors the wallet-switch handler at L79-110. Previous shape
  // (fire-and-forget clearSession → immediate invalidateQueries) re-
  // introduced the exact R4-06 race: the first wave of refetches carried
  // the still-live stale JWT, produced another 401, and every authed page
  // flashed its error state for the duration of the SIWE prompt.
  //
  // Also narrow the invalidation to wallet-scoped query keys — public
  // queries like ['sale','tiers'] don't need a re-fetch on auth change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onExpired() {
      if (!isAuthed) return;
      authedAddressRef.current = null;
      try { document.cookie = 'operon_auth=; Max-Age=0; Path=/'; } catch {}
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      try { localStorage.removeItem('operon_pending_attribution'); } catch {}
      // R8 ship-readiness re-review: move `setIsAuthed(false)` /
      // `setAuthError(null)` INSIDE the IIFE, AFTER `clearSession()`
      // resolves. Otherwise the merged `authenticate()` effect re-fires
      // (because isAuthed flipped to false) while logout is still in
      // flight; under E2E or auto-sign harnesses the logout response
      // arrives AFTER the new SIWE cookie is set and clears it.
      (async () => {
        await clearSession();
        setIsAuthed(false);
        setAuthError(null);
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        await queryClient.invalidateQueries({ queryKey: ['nodes'] });
        await queryClient.invalidateQueries({ queryKey: ['referrals'] });
        await queryClient.invalidateQueries({ queryKey: ['sale', 'status'] });
        await queryClient.removeQueries({ queryKey: ['admin'] });
      })().catch(() => {});
    }
    window.addEventListener('operon:auth-expired', onExpired);
    return () => window.removeEventListener('operon:auth-expired', onExpired);
  }, [isAuthed, queryClient]);

  return {
    isAuthenticated: isAuthed,
    isAuthenticating,
    authError,
    authenticate, // manual retry
  };
}
