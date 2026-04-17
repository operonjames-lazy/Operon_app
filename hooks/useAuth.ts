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
        // First mount with an existing session cookie. Trust it for the
        // currently-connected wallet and let the switch-detector below
        // catch any later account change. We cannot verify the cookie
        // matches this specific wallet without a /me round-trip; the
        // remaining risk is narrow (wagmi reconnecting to a different
        // account than the one that obtained the cookie, which requires
        // manual MetaMask permission changes between sessions).
        setIsAuthed(true);
        authedAddressRef.current = address.toLowerCase();
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
      // R4-06 fix: await `clearSession` and use targeted refetchQueries
      // instead of `queryClient.clear()`. The prior fire-and-forget shape
      // raced: /api/auth/logout had not yet cleared the server cookie when
      // the cache-wipe fired, so the next query round carried the old
      // cookie and returned 401, which threw into the error boundary and
      // rendered `/referrals` and `/nodes` as blank white pages (no
      // loading spinner, no error UI). Awaiting the logout, then
      // refetching wallet-scoped queries, lets each page's existing
      // `isLoading` skeleton render during the refetch.
      setIsAuthed(false);
      setAuthError(null);
      authedAddressRef.current = null;
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      (async () => {
        await clearSession();
        // Invalidate rather than clear — keeps cache entries mounted so
        // skeletons show, but marks them stale to trigger a refetch for
        // the new wallet.
        await queryClient.invalidateQueries();
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
      clearSession().catch(() => {});
      queryClient.clear();
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      setIsAuthed(false);
      setAuthError(null);
      authedAddressRef.current = null;
    },
  });

  // Ship-readiness R5: listen for 401 events from `authFetch`. A stale
  // session cookie (JWT_SECRET rotated, server-side logout, expiry) would
  // otherwise leave the UI "authenticated" while every authed query fails.
  // Tear down local state + let the merged connect effect re-run SIWE.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onExpired() {
      if (!isAuthed) return;
      clearSession().catch(() => {});
      setIsAuthed(false);
      setAuthError(null);
      authedAddressRef.current = null;
      try { document.cookie = 'operon_auth=; Max-Age=0; Path=/'; } catch {}
      queryClient.invalidateQueries();
    }
    window.addEventListener('operon:auth-expired', onExpired);
    return () => window.removeEventListener('operon:auth-expired', onExpired);
  }, [isAuthed, queryClient]);

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
      setIsAuthed(true);
      authedAddressRef.current = address.toLowerCase();
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
  }, [address, chainId, signMessageAsync, pendingReferralCode, clearPendingReferralCode]);

  return {
    isAuthenticated: isAuthed,
    isAuthenticating,
    authError,
    authenticate, // manual retry
  };
}
