import { NextRequest } from 'next/server';
import { generateNonce } from '@/lib/nonce';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimit(request, 'nonce', 30);
  if (rateLimited) return rateLimited;

  try {
    const nonce = await generateNonce();
    return Response.json({ nonce });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 503 });
  }
}
