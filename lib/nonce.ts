// Shared nonce verification logic
// Used by both /api/auth/nonce (generation) and /api/auth/wallet (verification)

let redisClient: any = null;
const memStore = new Map<string, number>();

async function getRedis() {
  if (redisClient) return redisClient;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    redisClient = Redis.fromEnv();
    return redisClient;
  }
  return null;
}

export async function generateNonce(): Promise<string> {
  const nonce = crypto.randomUUID();
  const redis = await getRedis();

  if (redis) {
    await redis.set(`nonce:${nonce}`, '1', { ex: 300 });
  } else {
    const now = Date.now();
    for (const [key, expiresAt] of memStore) {
      if (expiresAt < now) memStore.delete(key);
    }
    if (memStore.size >= 10000) throw new Error('Nonce store full');
    memStore.set(nonce, now + 5 * 60 * 1000);
  }

  return nonce;
}

export async function verifyNonce(nonce: string): Promise<boolean> {
  if (!nonce) return false;
  const redis = await getRedis();

  if (redis) {
    const exists = await redis.get(`nonce:${nonce}`);
    if (!exists) return false;
    await redis.del(`nonce:${nonce}`);
    return true;
  }

  const expiresAt = memStore.get(nonce);
  if (!expiresAt || expiresAt < Date.now()) return false;
  memStore.delete(nonce);
  return true;
}
