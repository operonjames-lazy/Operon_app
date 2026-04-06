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

export async function verifyToken(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.sub || null;
  } catch {
    return null;
  }
}

export async function verifyTokenPayload(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { sub: string; wallet: string; isEpp: boolean };
  } catch {
    return null;
  }
}
