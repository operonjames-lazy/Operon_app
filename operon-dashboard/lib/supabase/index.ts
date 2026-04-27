// Server-only re-export. Existing 37 server importers use `@/lib/supabase` —
// keep that path working without forcing a sweep. Browser code MUST import
// from `@/lib/supabase/browser` directly; the `'server-only'` import inside
// ./server transitively marks this module server-only too, so a 'use client'
// component that reaches `@/lib/supabase` fails the Next 16 build at compile
// time.
export { createServerSupabase } from './server';
