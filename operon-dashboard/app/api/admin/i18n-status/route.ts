import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import fs from 'node:fs/promises';
import path from 'node:path';

const LOCALES = ['en', 'tc', 'sc', 'ko', 'vi', 'th'];

/**
 * GET /api/admin/i18n-status
 *
 * Diffs translation files against `en` (the canonical key set) and reports
 * which keys are missing per locale. Expects translations to live at
 * `lib/i18n/<locale>.json` or `lib/i18n/translations.ts`. If the structure
 * is unexpected, returns an empty result instead of failing — this is an
 * informational surface, not a correctness gate.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const dir = path.join(process.cwd(), 'lib', 'i18n');
    const files = await fs.readdir(dir).catch(() => [] as string[]);

    const load = async (locale: string): Promise<Record<string, string> | null> => {
      // Prefer `<locale>.json`
      const jsonPath = path.join(dir, `${locale}.json`);
      try {
        const raw = await fs.readFile(jsonPath, 'utf8');
        return flatten(JSON.parse(raw));
      } catch {
        // Fall back to `<locale>.ts` — best-effort regex extract of string literals.
        const tsPath = path.join(dir, `${locale}.ts`);
        try {
          const raw = await fs.readFile(tsPath, 'utf8');
          return extractFromTs(raw);
        } catch {
          return null;
        }
      }
    };

    const per = await Promise.all(LOCALES.map(async (l) => [l, await load(l)] as const));
    const enMap = per.find(([l]) => l === 'en')?.[1];
    if (!enMap) {
      return Response.json({
        rows: LOCALES.map((l) => ({ locale: l, totalKeys: 0, missingKeys: [] })),
      });
    }
    const enKeys = Object.keys(enMap);

    const rows = per.map(([locale, map]) => {
      if (!map) return { locale, totalKeys: 0, missingKeys: enKeys };
      const missing = enKeys.filter((k) => !map[k] || map[k] === '');
      return { locale, totalKeys: Object.keys(map).length, missingKeys: missing };
    });

    return Response.json({ rows, filesOnDisk: files });
  } catch {
    return Response.json({ rows: LOCALES.map((l) => ({ locale: l, totalKeys: 0, missingKeys: [] })) });
  }
}

function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object') Object.assign(out, flatten(v, key));
  }
  return out;
}

function extractFromTs(src: string): Record<string, string> {
  // Very lightweight: match `'key': 'value'` or `"key": "value"` pairs at the leaf.
  const out: Record<string, string> = {};
  const re = /['"]([a-zA-Z0-9_.\-]+)['"]\s*:\s*['"`]([^'"`]*)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}
