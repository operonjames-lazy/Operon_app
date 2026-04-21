import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required. Set it in .env.local');
  }
  return new TextEncoder().encode(secret);
}

// Lazy-initialized JWT secret (avoids throwing during build)
let _jwtSecret: Uint8Array | null = null;
export function getSecret(): Uint8Array {
  if (!_jwtSecret) {
    _jwtSecret = getJwtSecret();
  }
  return _jwtSecret;
}

/**
 * Extract JWT from httpOnly cookie (primary) or Authorization header (fallback).
 * Cookie is set by /api/auth/wallet; header is supported for API clients.
 */
function extractToken(request: NextRequest): string | null {
  // 1. httpOnly cookie (browser sessions)
  const cookie = request.cookies.get('operon_session')?.value;
  if (cookie) return cookie;
  // 2. Authorization header (API clients, backward compat)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

export async function verifyToken(request: NextRequest): Promise<string | null> {
  const token = extractToken(request);
  if (!token) return null;

  try {
    // R4: pin the signing algorithm to HS256 (the one we actually sign
    // with at /api/auth/wallet). jose rejects `none` by default, but
    // pinning closes any future major-bump drift + any hypothetical
    // alg-confusion attack if a key ever rotates to an asymmetric form.
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return payload.sub || null;
  } catch {
    return null;
  }
}

export async function verifyTokenPayload(request: NextRequest) {
  const token = extractToken(request);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return payload as { sub: string; wallet: string; isEpp: boolean };
  } catch {
    return null;
  }
}
