# EPP Onboarding — Backend Spec

*For: Developer implementing the backend*
*Frontend: Operon_Elite_Partner_Onboarding.html (already built, 5 languages, responsive mobile + desktop)*
*Stack: Supabase (Postgres + Edge Functions) or Node.js + any Postgres*

---

## Overview

Four components:

1. Database — two tables (invites + partners)
2. API — two endpoints (validate invite, create partner)
3. Invite generator — CLI script the team runs to create code batches
4. Welcome email — triggered on partner creation

---

## 1. Database Schema

```sql
-- ════════════════════════════════════════════
-- Run once in Supabase SQL Editor or psql
-- ════════════════════════════════════════════

create table epp_invites (
  code         text primary key,           -- 'EPP-7K3M'
  assigned_to  text,                       -- prospect name (team fills in sheet)
  assigned_by  text not null,              -- team member who generated batch
  notes        text,                       -- 'Met at Korea Blockchain Week'
  status       text not null default 'unused',  -- 'unused' | 'used' | 'expired'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_by      uuid,                       -- references epp_partners.id after use
  used_at      timestamptz
);

create table epp_partners (
  id             uuid primary key default gen_random_uuid(),
  referral_code  text unique not null,     -- 'OPRN-APEX'
  invite_code    text not null references epp_invites(code),
  email          text unique not null,
  wallet_address text not null,            -- stored lowercase
  wallet_chain   text not null,            -- 'bsc' | 'arbitrum'
  telegram       text,                     -- '@handle' or null
  display_name   text,                     -- from URL ?name= param
  tier           text not null default 'affiliate_partner',
  credited_amount decimal not null default 0,  -- NOTE: populated by node sale commission engine, not this system
  terms_version  text not null default '1.0',
  lang           text default 'en',        -- language used during onboarding
  welcome_email_sent boolean not null default false,
  status         text not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Indexes
create index idx_invites_status on epp_invites(status);
create index idx_invites_expires on epp_invites(expires_at);
create index idx_partners_email on epp_partners(email);
create index idx_partners_wallet on epp_partners(wallet_address);
create index idx_partners_referral on epp_partners(referral_code);

-- Auto-update updated_at
create or replace function update_modified() returns trigger as $$
begin NEW.updated_at = now(); return NEW; end;
$$ language plpgsql;

create trigger set_updated before update on epp_invites
  for each row execute function update_modified();
create trigger set_updated before update on epp_partners
  for each row execute function update_modified();

-- Expire old codes — run via cron, not on every request
-- If pg_cron is available:
-- select cron.schedule('expire-invites', '0 * * * *',
--   $$update epp_invites set status = 'expired' where status = 'unused' and expires_at < now()$$
-- );
```

### Notes

- `credited_amount` is a forward-looking column. It will be written to by the node sale commission engine when sales are attributed to a partner. This onboarding system never writes to it.
- `welcome_email_sent` tracks whether the email was successfully delivered. If false, can be retried manually or via a periodic check.
- Unique constraints on `email` and `wallet_address` naturally prevent race conditions — if two requests try to create with the same email simultaneously, the second insert fails at the database level. No application-level locking needed.

---

## 2. API Endpoints

### Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
RESEND_API_KEY=re_...
SITE_URL=https://operon.network
ADMIN_WEBHOOK_URL=https://...  (Telegram bot or Slack webhook for notifications)
```

### POST /api/epp/validate

Called on page load. Checks if invite code is valid.

**Request:** `{ "code": "EPP-7K3M" }`

**Success:** `{ "valid": true, "expires_in_days": 12 }`

**Failure:** `{ "valid": false, "reason": "expired" | "used" | "not_found" }`

**Logic:**

1. Validate format: must match `EPP-[A-Z0-9]{4}`. Reject otherwise.
2. Query: `select code, status, expires_at from epp_invites where code = $1`
3. If not found → `{ valid: false, reason: "not_found" }`
4. If `status = 'used'` → `{ valid: false, reason: "used" }`
5. If `status = 'expired'` or `expires_at < now()` → `{ valid: false, reason: "expired" }`
6. Calculate days remaining, return `{ valid: true, expires_in_days: N }`

No need to run a bulk expire function here. Just check this specific code's expiry inline.

### POST /api/epp/create

Called when partner submits details.

**Request:**
```json
{
  "invite_code": "EPP-7K3M",
  "email": "david@example.com",
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38",
  "wallet_chain": "bsc",
  "telegram": "@davidkim",
  "display_name": "David",
  "lang": "ko"
}
```

**Success:**
```json
{
  "referral_code": "OPRN-K7VM",
  "referral_link": "https://operon.network/node?ref=OPRN-K7VM",
  "email": "david@example.com",
  "wallet": "0x742d...2bd38",
  "chain": "bsc"
}
```

**Errors:** `{ "error": "email_taken" | "wallet_taken" | "invite_used" | "invite_expired" | "invite_invalid" | "server_error" }`

**Logic:**

1. Validate inputs:
   - `invite_code`: matches `EPP-[A-Z0-9]{4}`
   - `email`: valid email format
   - `wallet_address`: matches `0x[a-fA-F0-9]{40}`
   - `wallet_chain`: either `'bsc'` or `'arbitrum'`
2. Lowercase the wallet address
3. Look up invite: `select * from epp_invites where code = $1`
   - Not found → `invite_invalid`
   - `status = 'used'` → `invite_used`
   - `expires_at < now()` → `invite_expired`
4. Generate referral code: OPRN-[4 chars] from charset `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L). Check uniqueness with `select 1 from epp_partners where referral_code = $1`. Loop until unique. At this volume, first attempt will succeed virtually every time.
5. Insert partner. If email unique constraint fails → `email_taken`. If wallet unique constraint fails → `wallet_taken`. Let the DB enforce this — don't pre-check.
6. Update invite: `update epp_invites set status = 'used', used_by = $1, used_at = now() where code = $2`
7. Send welcome email (async, don't block response). On success, update `welcome_email_sent = true`. On failure, log but don't fail the request.
8. Send admin notification (async). See Section 5.
9. Return referral code and link.

**On race conditions:** If two people somehow get the same invite link and submit simultaneously, the first insert succeeds. The second hits a unique constraint (email or wallet) or finds the invite already marked as used. They get an error. This is correct behaviour — whoever completes first gets it.

**On errors during the request:** If the API returns 5xx or the network drops, the frontend shows "Something went wrong. Please try again." The invite code is still valid (either the create succeeded and the invite is marked used, or nothing happened). The partner can retry.

---

## 3. Invite Code Generator

CLI script. Run locally by team members.

**Usage:** `node generate-invites.js <count> <assigned_by> [expiry_days]`

**Examples:**
```bash
node generate-invites.js 20 "John" 14 > batch_april.csv
node generate-invites.js 50 "Sarah (Korea)" 21 > korea_batch.csv
```

**Output (CSV to stdout):**
```
code,invite_url,expires_at,assigned_by,assigned_to
EPP-7K3M,https://operon.network/partner?code=EPP-7K3M&name=,2026-04-16,John,
EPP-R4VN,https://operon.network/partner?code=EPP-R4VN&name=,2026-04-16,John,
```

**Summary (to stderr, not captured in file):**
```
✓ 20 codes generated. Expiry: Wed Apr 16 2026
  Assigned by: John
  View in Supabase: https://supabase.com/dashboard/project/XXX/editor/epp_invites
  
  Next: paste CSV into Google Sheet. Fill in assigned_to.
  Append name and lang to URL: ...&name=David&lang=ko
```

**Logic:**
1. Generate N unique codes (check against existing in DB)
2. Bulk insert into epp_invites
3. Output CSV

**Team workflow:**
1. Run script → get CSV
2. Paste into Google Sheet
3. For each row, fill in the prospect name in `assigned_to`
4. Build the final URL: `https://operon.network/partner?code=EPP-7K3M&name=David&lang=ko`
5. Send via Telegram/WhatsApp to the prospect
6. Mark as "sent" in the sheet
7. Check Supabase dashboard or wait for admin notification to see if they accepted

---

## 4. Welcome Email

Triggered by the create endpoint after partner insertion.

**Provider:** Resend (recommended for speed) or SendGrid.

**From:** `Operon Network <partners@operon.network>`

**Subject (by language):**
- EN: "Welcome to the Operon Elite Partner Programme"
- 繁中: "歡迎加入 Operon 菁英合作夥伴計畫"
- 简中: "欢迎加入 Operon 精英合作伙伴计划"
- 한국어: "Operon 엘리트 파트너 프로그램에 오신 것을 환영합니다"
- Tiếng Việt: "Chào mừng bạn đến với Chương Trình Đối Tác Tinh Hoa Operon"

**Content — this is where the confidential programme details go:**

1. Partner's referral code and link
2. Full tier table (all 6 tiers with thresholds, L1 rates, cascade depth, stipends, buyer discount)
3. Milestone bonus table (7 thresholds, $500 to $90,000)
4. Credited Amount weight breakdown (L1 100% through L8 1%)
5. Stipend activation gate rules (5× biweekly, 80% = half, below = forfeited)
6. Key reminders (nodes are participation licences, don't publish rates, approved branding only)
7. Resource links (Pitch Training Manual PDF, Brand Assets, T&C link)
8. Confidentiality notice: "This email contains confidential programme information. Do not forward or publish the commission rates, tier thresholds, or milestone values."

**Template:** Dark background (#0A1018), light text, ice-blue accents (#93C5FD), inline CSS only, table-based layout, 600px max-width. Use MJML or React Email to build, then export to HTML. Test in Gmail, Outlook, Apple Mail.

**Tracking:** On successful send, update `epp_partners.welcome_email_sent = true`. For partners where this is false, the team can manually resend via admin query or a simple retry script.

---

## 5. Admin Notification

Fire on every successful partner creation. Keeps the team informed without checking the database.

**Option A — Telegram Bot (recommended for your team):**
```javascript
async function notifyAdmin(partner) {
  const msg = `New Elite Partner\n\n` +
    `Name: ${partner.display_name || '—'}\n` +
    `Email: ${partner.email}\n` +
    `Code: ${partner.referral_code}\n` +
    `Chain: ${partner.wallet_chain}\n` +
    `Lang: ${partner.lang}\n` +
    `Invite: ${partner.invite_code}`;
  
  await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TG_ADMIN_CHAT_ID,
      text: msg
    })
  });
}
```

**Option B — Slack Webhook:**
```javascript
await fetch(process.env.SLACK_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: `New partner: ${partner.display_name} (${partner.email}) — ${partner.referral_code}` })
});
```

Fire-and-forget. Don't fail the create request if notification fails.

---

## 6. Frontend Integration

The onboarding HTML currently generates referral codes client-side for demo purposes. To connect to the real backend, replace two functions:

**On page load — validate the invite:**

Call `POST /api/epp/validate` with the code from the URL. If invalid, hide the letter and show a message based on the reason (expired, used, not found). If valid, update the expiry display.

**On form submit — create the partner:**

Call `POST /api/epp/create` with all form data + current language. Show loading state on the button. On success, populate the confirmation screen with the returned referral code. On error, show the appropriate message:
- `email_taken` → "This email is already registered."
- `wallet_taken` → "This wallet is already registered."
- `invite_used` → "This invitation has already been used."
- `invite_expired` → "This invitation has expired."
- `server_error` / network failure → "Something went wrong. Please try again."

The rest of the page (language switching, accordion, form validation, share buttons) stays as-is.

---

## 7. Deployment

**Simplest path:** Supabase Edge Functions for the two endpoints. Same project as the database. Free tier covers this volume.

```
supabase/functions/epp-validate/index.ts
supabase/functions/epp-create/index.ts
```

Deploy: `supabase functions deploy epp-validate && supabase functions deploy epp-create`

**If frontend is Next.js:** Use API routes at `/api/epp/validate` and `/api/epp/create`. Same domain, no CORS.

**CORS (if API on different domain):** Allow POST from your site domain only. Handle OPTIONS preflight.

**Static frontend hosting:** The onboarding HTML is a single static file. Host on Vercel, Netlify, or any CDN. It calls the API endpoints and does everything client-side.

---

## 8. Security

- **Rate limiting:** 10 requests/minute/IP on both endpoints. The invite code space is 24^4 = 331,776 — brute-force guessable without limits. Use Vercel's built-in rate limiting, Supabase's `x-forwarded-for` check, or Upstash Redis.
- **Service key:** Server-side only. Never in frontend code.
- **Input validation:** All inputs checked by regex before DB insertion.
- **Wallet validation:** Format-checked (0x + 40 hex) but not chain-verified. If a partner enters a wrong address, the first commission payout will fail. Document this — it's acceptable at this scale. Changes require support contact.

---

## 9. Admin Queries

Useful queries for monitoring from the Supabase SQL editor:

```sql
-- All unused codes (what's still pending)
select code, assigned_to, assigned_by, expires_at
from epp_invites where status = 'unused' order by expires_at;

-- All registered partners
select referral_code, display_name, email, wallet_chain, lang, created_at
from epp_partners where status = 'active' order by created_at desc;

-- Codes expiring within 3 days (send reminders to team)
select code, assigned_to, expires_at
from epp_invites
where status = 'unused' and expires_at between now() and now() + interval '3 days';

-- Usage summary
select
  count(*) filter (where status = 'unused') as pending,
  count(*) filter (where status = 'used') as accepted,
  count(*) filter (where status = 'expired') as expired
from epp_invites;

-- Partners missing welcome email (for manual resend)
select email, referral_code, display_name, lang
from epp_partners where welcome_email_sent = false;

-- Partners by chain
select wallet_chain, count(*) from epp_partners group by wallet_chain;

-- Partners by language
select lang, count(*) from epp_partners group by lang;
```

---

## 10. Testing Checklist

- [ ] Generate 5 test codes via CLI script
- [ ] Valid code → page shows the letter with correct expiry
- [ ] Invalid code → blocked state with appropriate message
- [ ] Expired code → expired message
- [ ] Used code → "already used" message
- [ ] Complete onboarding → partner in DB, invite marked used, referral code returned
- [ ] Same code again → "already used" error
- [ ] Same email with different code → "email taken" error
- [ ] Same wallet with different code → "wallet taken" error
- [ ] Welcome email arrives in correct language with full programme details
- [ ] Admin notification fires (Telegram/Slack)
- [ ] `welcome_email_sent` is true after successful send
- [ ] All 5 languages through full flow
- [ ] Mobile: Telegram link → open in Chrome → complete onboarding
- [ ] Desktop: full flow at 1920px width
- [ ] Network error during submit → "try again" message, invite still valid on retry
