'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { setAuthToken, clearAuthToken, getAuthToken } from '@/lib/api/fetch';

/**
 * Auth orchestration hook.
 * Bridges RainbowKit wallet connection with SIWE JWT authentication.
 *
 * Flow:
 * 1. User connects wallet via RainbowKit → useAccount detects address
 * 2. This hook fetches a nonce from /api/auth/nonce
 * 3. Prompts user to sign a SIWE message (via MetaMask)
 * 4. Sends signed message to /api/auth/wallet → receives JWT
 * 5. Stores JWT in localStorage via setAuthToken()
 * 6. All subsequent authFetch() calls include the Bearer token
 * 7. On disconnect, clears token
 */

export function useAuth() {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check if we already have a valid token on mount
  useEffect(() => {
    const existing = getAuthToken();
    if (existing && isConnected) {
      setIsAuthenticated(true);
    }
  }, [isConnected]);

  // Authenticate when wallet connects (and we don't have a token)
  useEffect(() => {
    if (isConnected && address && !isAuthenticated && !isAuthenticating) {
      authenticate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Clear auth on disconnect
  useEffect(() => {
    if (!isConnected) {
      clearAuthToken();
      setIsAuthenticated(false);
      setAuthError(null);
    }
  }, [isConnected]);

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

      // 4. Send to backend
      const authRes = await fetch('/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          message: messageStr,
          signature,
        }),
      });

      if (!authRes.ok) {
        const err = await authRes.json();
        throw new Error(err.message || 'Authentication failed');
      }

      const { token } = await authRes.json();

      // 5. Store JWT
      setAuthToken(token);
      setIsAuthenticated(true);
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
  }, [address, chainId, signMessageAsync]);

  return {
    isAuthenticated,
    isAuthenticating,
    authError,
    authenticate, // manual retry
  };
}
