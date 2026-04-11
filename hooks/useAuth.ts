'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
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

  // Check if we already have a valid session cookie on mount
  useEffect(() => {
    if (checkCookie() && isConnected) {
      setIsAuthed(true);
    }
  }, [isConnected]);

  // Authenticate when wallet connects (and we don't have a session)
  useEffect(() => {
    if (isConnected && address && !isAuthed && !isAuthenticating) {
      authenticate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Clear auth + cached data on disconnect (prevents data bleed to next wallet)
  useEffect(() => {
    if (!isConnected) {
      clearSession();
      queryClient.clear();
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      setIsAuthed(false);
      setAuthError(null);
    }
  }, [isConnected, queryClient]);

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
