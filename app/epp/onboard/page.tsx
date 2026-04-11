'use client';

/**
 * Elite Partner Programme onboarding flow.
 *
 * Public route. Reached via a private invite link of the form:
 *
 *   /epp/onboard?inv=EPP-XXXX&name=David
 *
 * Flow:
 *   Step 0 — Letter (the personal invitation, also where the invite is validated on load)
 *   Step 1 — Programme Terms & Conditions (8 + 1 sections, 3 confirmation checkboxes)
 *   Step 2 — Account setup (email, payout chain selector, telegram, wallet connect)
 *   Step 3 — Confirmation (referral code + share)
 *
 * On step 2 submission we:
 *   1. Fetch a SIWE nonce
 *   2. Build a "Sign in to Operon as Elite Partner" message
 *   3. Have the user sign it via RainbowKit/wagmi
 *   4. POST to /api/auth/wallet with the SIWE payload AND an `eppOnboard` payload
 *      (single round trip — creates user + EPP partner in one transaction)
 *   5. Store the JWT and forward into the dashboard at /referrals
 *
 * Visual language: standalone "exclusive invite" letter style, deliberately
 * different from the dashboard. Uses inline CSS via styled-jsx so we don't
 * have to extend Tailwind config or add new theme tokens.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { SiweMessage } from 'siwe';
import { setAuthToken } from '@/lib/api/fetch';
import { EPP_LANGS, EPP_LANG_LIST, type EppLang, type EppLangPack } from './epp-translations';

type Step = 0 | 1 | 2 | 3;
type InviteState =
  | { status: 'loading' }
  | { status: 'invalid' | 'used' | 'expired' }
  | { status: 'ok'; expiresInDays: number | null };

const TERMS_VERSION = '1.0';

export default function EppOnboardPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  // ─── URL params ────────────────────────────────────────────────────────
  const [inviteCode, setInviteCode] = useState<string>('');
  const [inviteeName, setInviteeName] = useState<string>('Partner');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const inv = (params.get('inv') || '').toUpperCase();
    const name = params.get('name') || 'Partner';
    setInviteCode(inv);
    setInviteeName(name);
  }, []);

  // ─── Language ──────────────────────────────────────────────────────────
  const [lang, setLang] = useState<EppLang>('en');
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const code = (navigator.language || 'en').toLowerCase();
    if (code.startsWith('zh-tw') || code.startsWith('zh-hant')) setLang('tc');
    else if (code.startsWith('zh')) setLang('sc');
    else if (code.startsWith('ko')) setLang('ko');
    else if (code.startsWith('vi')) setLang('vi');
    else if (code.startsWith('th')) setLang('th');
  }, []);
  const t: EppLangPack = EPP_LANGS[lang];

  // ─── Invite validation ────────────────────────────────────────────────
  const [invite, setInvite] = useState<InviteState>({ status: 'loading' });
  useEffect(() => {
    if (!inviteCode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/epp/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: inviteCode }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.valid) {
          setInvite({ status: 'ok', expiresInDays: data.expires_in_days ?? null });
        } else if (data.reason === 'used') {
          setInvite({ status: 'used' });
        } else if (data.reason === 'expired') {
          setInvite({ status: 'expired' });
        } else {
          setInvite({ status: 'invalid' });
        }
      } catch {
        if (!cancelled) setInvite({ status: 'invalid' });
      }
    })();
    return () => { cancelled = true; };
  }, [inviteCode]);

  // ─── Step + form state ───────────────────────────────────────────────
  const [step, setStep] = useState<Step>(0);
  const [tc1, setTc1] = useState(false);
  const [tc2, setTc2] = useState(false);
  const [tc3, setTc3] = useState(false);
  const [openSection, setOpenSection] = useState<number>(0);

  const [email, setEmail] = useState('');
  const [telegram, setTelegram] = useState('');
  const [payoutChain, setPayoutChain] = useState<'arbitrum' | 'bsc'>('bsc');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Confirmation page result
  const [resultCode, setResultCode] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!toastMsg) return;
    const id = setTimeout(() => setToastMsg(null), 2000);
    return () => clearTimeout(id);
  }, [toastMsg]);

  const allTcChecked = tc1 && tc2 && tc3;
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email]);
  const canSubmit = emailValid && isConnected && !!address && !submitting;

  // ─── Submit: SIWE + EPP creation in one round trip ─────────────────────
  async function handleSubmit() {
    if (!canSubmit || !address || !chainId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const nonceRes = await fetch('/api/auth/nonce');
      if (!nonceRes.ok) throw new Error('nonce_failed');
      const { nonce } = await nonceRes.json();

      const siwe = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Operon as Elite Partner',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
      });
      const messageStr = siwe.prepareMessage();
      const signature = await signMessageAsync({ message: messageStr });

      const res = await fetch('/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          message: messageStr,
          signature,
          eppOnboard: {
            inviteCode,
            email,
            payoutChain,
            telegram: telegram || null,
            displayName: inviteeName !== 'Partner' ? inviteeName : null,
            language: lang,
            termsVersion: TERMS_VERSION,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'invite_used') throw new Error('invite_used');
        if (err.error === 'invite_expired') throw new Error('invite_expired');
        if (err.error === 'invite_invalid') throw new Error('invite_invalid');
        throw new Error('create_failed');
      }

      const data = await res.json();
      const partnerCode = data.user?.partner?.referral_code;
      if (!partnerCode) throw new Error('create_failed');

      setAuthToken(data.token);
      setResultCode(partnerCode);
      setStep(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'create_failed';
      if (msg.includes('user rejected') || msg.includes('User rejected')) {
        setSubmitError(t.errSignatureRejected);
      } else if (msg === 'invite_used') {
        setSubmitError(t.errInviteUsed);
      } else if (msg === 'invite_expired') {
        setSubmitError(t.errInviteExpired);
      } else if (msg === 'invite_invalid') {
        setSubmitError(t.errInviteInvalid);
      } else {
        setSubmitError(t.errCreateFailed);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Confirmation actions ────────────────────────────────────────────
  const referralLink = resultCode ? `${typeof window !== 'undefined' ? window.location.origin : 'https://operon.network'}/sale?ref=${resultCode}` : '';
  function copy(what: 'code' | 'link') {
    if (!resultCode) return;
    const text = what === 'code' ? resultCode : referralLink;
    navigator.clipboard.writeText(text).then(() => {
      setToastMsg(what === 'code' ? t.toastCodeCopied : t.toastLinkCopied);
    });
  }
  function share() {
    if (!resultCode) return;
    if (navigator.share) {
      navigator.share({ title: 'Operon Node Sale', text: `Referral code ${resultCode}:`, url: referralLink }).catch(() => {});
    } else {
      copy('link');
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  if (!inviteCode || invite.status === 'invalid') {
    return (
      <EppShell lang={lang} onLang={setLang}>
        <BlockedState title={t.errInviteInvalid} />
      </EppShell>
    );
  }
  if (invite.status === 'loading') {
    return (
      <EppShell lang={lang} onLang={setLang}>
        <BlockedState title="…" />
      </EppShell>
    );
  }
  if (invite.status === 'used') {
    return (
      <EppShell lang={lang} onLang={setLang}>
        <BlockedState title={t.errInviteUsed} />
      </EppShell>
    );
  }
  if (invite.status === 'expired') {
    return (
      <EppShell lang={lang} onLang={setLang}>
        <BlockedState title={t.errInviteExpired} />
      </EppShell>
    );
  }

  return (
    <EppShell lang={lang} onLang={setLang}>
      <div className="pw">
        <div className={`pg ${step === 0 ? 'on' : step > 0 ? 'done' : ''}`} />
        <div className={`pg ${step === 1 ? 'on' : step > 1 ? 'done' : ''}`} />
        <div className={`pg ${step === 2 ? 'on' : step > 2 ? 'done' : ''}`} />
        <div className={`pg ${step === 3 ? 'on' : ''}`} />
      </div>

      {/* ═══ STEP 0: LETTER ═══ */}
      {step === 0 && (
        <div className="step active">
          <div className="letter-wrap">
            <div className="letter-top" />
            <div className="mark">
              <svg width="28" height="32" viewBox="0 0 28 32" fill="none">
                <path d="M14 0L27.856 8V24L14 32L0.144 24V8L14 0Z" fill="none" stroke="var(--gold)" strokeWidth="0.75" opacity="0.6" />
                <path d="M14 6L23.526 11.5V22.5L14 28L4.474 22.5V11.5L14 6Z" fill="none" stroke="var(--gold)" strokeWidth="0.5" opacity="0.35" />
              </svg>
            </div>
            <div className="inv-label">{t.invLabel}</div>
            <div className="inv-exp">{t.invExp}</div>

            <div className="greeting">
              {t.greeting} <em>{inviteeName}</em>,
            </div>

            <div>
              <p className="lp">{t.p1}</p>
              <p className="lp">{t.p2}</p>
              <p className="lp">{t.p3}</p>
              <p className="lp">{t.p4}</p>
            </div>

            <div className="lsep">
              <div className="lsep-line" />
              <div className="lsep-diamond" />
              <div className="lsep-line" />
            </div>

            <div className="lsum">
              <div className="lsum-label">{t.sumLabel}</div>
              <div className="lsum-items">
                {t.sumItems.map((item, i) => (
                  <div key={i} className="si">{item}</div>
                ))}
              </div>
              <div className="lsum-note">{t.sumNote}</div>
            </div>

            <div className="lclose">{t.close}</div>
            <div className="lsig">{t.sig}</div>

            <div className="letter-bottom" />
            <button className="btn bp" onClick={() => setStep(1)}>{t.btnReview}</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 1: TERMS ═══ */}
      {step === 1 && (
        <div className="step active">
          <div className="ey">{t.tcEy}</div>
          <div className="tc-t">{t.tcTitle}</div>
          <p className="sub">{t.tcSub}</p>
          <div className="accordion">
            {t.sec.map((s, i) => (
              <div key={i} className={`ai ${openSection === i ? 'open' : ''}`} onClick={() => setOpenSection(openSection === i ? -1 : i)}>
                <div className="ah">
                  <div><span className="an">{s.n}</span>{s.t}</div>
                  <div className="aw">▼</div>
                </div>
                <div className="ab" dangerouslySetInnerHTML={{ __html: s.b }} />
              </div>
            ))}
          </div>
          <div className="checks">
            <label className="ck">
              <input type="checkbox" checked={tc1} onChange={(e) => setTc1(e.target.checked)} />
              <div className="cb" />
              <div className="ck-text">{t.chk1}</div>
            </label>
            <label className="ck">
              <input type="checkbox" checked={tc2} onChange={(e) => setTc2(e.target.checked)} />
              <div className="cb" />
              <div className="ck-text">{t.chk2}</div>
            </label>
            <label className="ck">
              <input type="checkbox" checked={tc3} onChange={(e) => setTc3(e.target.checked)} />
              <div className="cb" />
              <div className="ck-text">{t.chk3}</div>
            </label>
          </div>
          <button className="btn bp" disabled={!allTcChecked} onClick={() => setStep(2)}>{t.btnAccept}</button>
          <button className="bb" onClick={() => setStep(0)}>{t.btnBack}</button>
        </div>
      )}

      {/* ═══ STEP 2: DETAILS + WALLET ═══ */}
      {step === 2 && (
        <div className="step active">
          <div className="ey">{t.formEy}</div>
          <div className="form-t">{t.formTitle}</div>
          <p className="sub">{t.formSub}</p>

          <div className="fg">
            <label className="fl">{t.labelEmail}</label>
            <input
              type="email"
              className={`fi ${email && !emailValid ? 'err' : ''}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {email && !emailValid && <div className="fe-show">{t.errEmail}</div>}
          </div>

          <div className="fg">
            <label className="fl">{t.labelChain}</label>
            <div className="csel">
              <div className={`co ${payoutChain === 'bsc' ? 'sel' : ''}`} onClick={() => setPayoutChain('bsc')}>
                <div className="co-n">BNB Chain</div>
                <div className="co-s">BEP-20</div>
              </div>
              <div className={`co ${payoutChain === 'arbitrum' ? 'sel' : ''}`} onClick={() => setPayoutChain('arbitrum')}>
                <div className="co-n">Arbitrum</div>
                <div className="co-s">ERC-20</div>
              </div>
            </div>
          </div>

          <div className="fg">
            <label className="fl">{t.labelWallet}</label>
            <div className="wallet-row">
              <ConnectButton chainStatus="none" accountStatus="address" showBalance={false} />
            </div>
            <div className="fh">{t.hintWallet}</div>
          </div>

          <div className="fg">
            <label className="fl">{t.labelTg} <span>{t.labelTgOpt}</span></label>
            <input
              type="text"
              className="fi"
              placeholder="@handle"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
            />
          </div>

          {submitError && <div className="form-err">{submitError}</div>}

          <button
            className="btn bp"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? t.signingMessage : !isConnected ? t.btnConnect : t.btnCreate}
          </button>
          <button className="bb" onClick={() => setStep(1)} disabled={submitting}>{t.btnBack}</button>
        </div>
      )}

      {/* ═══ STEP 3: CONFIRMATION ═══ */}
      {step === 3 && resultCode && (
        <div className="step active">
          <div className="conf">
            <div className="conf-seal" />
            <div className="conf-label">{t.confLabel}</div>
            <div className="conf-t">{t.confTitle} <em>{inviteeName}</em>.</div>

            <div className="code-block">
              <div className="code-block-label">{t.codeLabel}</div>
              <div className="code-block-value">{resultCode}</div>
              <div className="code-block-link">{referralLink}</div>
            </div>

            <div className="conf-actions">
              <button className="btn bp" onClick={() => copy('code')}>{t.btnCopy}</button>
              <button className="btn bs" onClick={() => copy('link')}>{t.btnLink}</button>
              <button className="btn bs" onClick={share}>{t.btnShare}</button>
            </div>

            <div className="conf-email">
              {t.confEmailBefore} <strong>{email}</strong> {t.confEmailAfter}
            </div>

            <div className="conf-next">
              <p>{t.next1}</p>
              <p>{t.next2}</p>
              <p>{t.next3}</p>
            </div>

            <button className="btn bs" onClick={() => router.push('/referrals')}>{t.btnDash}</button>

            <div className="foot">
              <p>
                {t.footPayout} <span className="m">{address?.slice(0, 6)}...{address?.slice(-4)}</span> {t.footOn} <span className="m">{payoutChain === 'bsc' ? 'BNB Chain' : 'Arbitrum'}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast show">{toastMsg}</div>}
    </EppShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function BlockedState({ title }: { title: string }) {
  return (
    <div className="step active">
      <div className="letter-wrap">
        <div className="letter-top" />
        <div className="inv-label">Operon Elite Partner Programme</div>
        <p className="lp" style={{ marginTop: 32, textAlign: 'center' }}>{title}</p>
      </div>
    </div>
  );
}

function EppShell({
  children,
  lang,
  onLang,
}: {
  children: React.ReactNode;
  lang: EppLang;
  onLang: (l: EppLang) => void;
}) {
  return (
    <>
      <div className="ambient"><div className="orb1" /><div className="orb2" /></div>
      <div className="app" data-lang={lang}>
        <div className="header"><div className="logo">OPER<span>ON</span></div></div>
        <div className="lang-bar">
          {EPP_LANG_LIST.map((l) => (
            <button key={l} className={`lang-pill ${lang === l ? 'active' : ''}`} onClick={() => onLang(l)}>
              {EPP_LANGS[l].pillLabel}
            </button>
          ))}
        </div>
        {children}
      </div>
      <style jsx global>{`
        :root {
          --void: #0A1018;
          --card: #121E2E;
          --card2: #162436;
          --edge: #1E2E48;
          --blue: #2563EB;
          --glow: #3B82F6;
          --ice: #93C5FD;
          --white: #F4F7FC;
          --soft: #CBD8EA;
          --dim: #7E95B0;
          --green: #22C55E;
          --red: #EF4444;
          --gold: #C9A55C;
          --sf: 'Cormorant Garamond', Georgia, serif;
          --ss: 'DM Sans', sans-serif;
          --mn: 'DM Mono', monospace;
          --dp: 'Unbounded', sans-serif;
        }
        .ambient { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
        .ambient .orb1 { position: absolute; top: -15%; left: 15%; width: 500px; height: 500px; background: radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 65%); }
        .ambient .orb2 { position: absolute; bottom: -10%; right: 10%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(147,197,253,0.05) 0%, transparent 60%); }
        body { background: var(--void) !important; color: var(--soft); font-family: var(--ss); line-height: 1.7; }
        .app { max-width: 580px; margin: 0 auto; padding: 24px 20px 60px; position: relative; z-index: 1; }
        .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 0 32px; }
        .logo { font-family: var(--dp); font-weight: 700; font-size: 13px; color: var(--white); letter-spacing: 0.06em; }
        .logo span { color: var(--ice); }
        .lang-bar { display: flex; justify-content: center; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
        .lang-pill { font-family: var(--mn); font-size: 10px; letter-spacing: 0.06em; color: var(--dim); background: none; border: 1px solid var(--edge); border-radius: 4px; padding: 5px 12px; cursor: pointer; transition: all 0.2s; }
        .lang-pill:hover { border-color: rgba(147,197,253,0.2); color: var(--soft); }
        .lang-pill.active { border-color: var(--gold); color: var(--gold); }

        .pw { display: flex; gap: 8px; margin-bottom: 8px; }
        .pg { height: 1px; flex: 1; background: var(--edge); transition: background 0.6s; }
        .pg.on { background: var(--ice); }
        .pg.done { background: rgba(147,197,253,0.35); }

        .step { display: block; }
        .letter-wrap { position: relative; margin-top: 32px; }
        .letter-top { height: 1px; background: linear-gradient(90deg, transparent, rgba(147,197,253,0.25), var(--ice), rgba(147,197,253,0.15), transparent); margin-bottom: 48px; position: relative; }
        .letter-top::after { content: ''; position: absolute; top: -3px; left: 50%; transform: translateX(-50%); width: 7px; height: 7px; background: var(--void); border: 1px solid var(--gold); border-radius: 50%; }
        .mark { display: flex; align-items: center; justify-content: center; margin: 0 auto 40px; }
        .inv-label { font-family: var(--mn); font-size: 9px; letter-spacing: 0.22em; color: var(--gold); text-transform: uppercase; text-align: center; margin-bottom: 12px; }
        .inv-exp { font-family: var(--mn); font-size: 10px; color: var(--dim); text-align: center; margin-bottom: 52px; }

        .greeting { font-family: var(--sf); font-size: 36px; font-weight: 300; color: var(--white); margin-bottom: 40px; line-height: 1.2; }
        .greeting em { font-style: italic; color: var(--ice); }
        .lp { font-family: var(--sf); font-size: 20px; font-weight: 300; color: var(--soft); line-height: 1.85; margin-bottom: 24px; letter-spacing: 0.005em; }

        .lsep { display: flex; align-items: center; gap: 16px; margin: 48px 0; }
        .lsep-line { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(201,165,92,0.12), transparent); }
        .lsep-line:last-child { background: linear-gradient(90deg, transparent, rgba(201,165,92,0.12)); }
        .lsep-diamond { width: 5px; height: 5px; background: var(--gold); opacity: 0.4; transform: rotate(45deg); flex-shrink: 0; }

        .lsum { margin: 0 0 48px; padding: 28px; background: linear-gradient(135deg, var(--card), rgba(10,18,32,0.6)); border: 1px solid var(--edge); border-radius: 8px; position: relative; overflow: hidden; }
        .lsum::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(201,165,92,0.12), transparent); }
        .lsum-label { font-family: var(--mn); font-size: 9px; letter-spacing: 0.16em; color: var(--dim); text-transform: uppercase; margin-bottom: 16px; }
        .lsum-items { font-size: 14px; color: var(--soft); line-height: 1.6; }
        .lsum-items .si { display: flex; align-items: baseline; gap: 10px; padding: 6px 0; }
        .lsum-items .si::before { content: '·'; color: var(--gold); font-size: 18px; line-height: 1; flex-shrink: 0; }
        .lsum-note { font-size: 12px; color: var(--dim); margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--edge); line-height: 1.7; font-style: italic; }

        .lclose { font-family: var(--sf); font-size: 18px; font-weight: 300; font-style: italic; color: var(--dim); margin-bottom: 4px; }
        .lsig { font-family: var(--sf); font-size: 20px; font-weight: 500; color: var(--soft); margin-bottom: 48px; }
        .letter-bottom { height: 1px; background: linear-gradient(90deg, transparent, rgba(201,165,92,0.1), transparent); margin-bottom: 32px; }

        .btn { display: block; width: 100%; padding: 15px 24px; border: none; border-radius: 6px; font-family: var(--ss); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.25s; text-align: center; letter-spacing: 0.02em; margin-bottom: 8px; }
        .bp { background: var(--blue); color: #fff; }
        .bp:hover { background: var(--glow); box-shadow: 0 4px 20px rgba(37,99,235,0.2); }
        .bp:disabled { background: var(--edge); color: var(--dim); cursor: not-allowed; box-shadow: none; }
        .bs { background: transparent; color: var(--ice); border: 1px solid var(--edge); }
        .bs:hover { border-color: rgba(147,197,253,0.2); background: rgba(147,197,253,0.03); }
        .bb { background: none; color: var(--dim); font-size: 13px; padding: 14px; border: none; cursor: pointer; font-family: var(--ss); width: 100%; text-align: center; margin-top: 2px; }
        .bb:hover { color: var(--ice); }

        .ey { font-family: var(--mn); font-size: 9px; letter-spacing: 0.18em; color: var(--dim); text-transform: uppercase; margin-bottom: 20px; }
        .tc-t, .form-t { font-family: var(--sf); font-size: 30px; font-weight: 300; color: var(--white); margin-bottom: 8px; }
        .sub { font-size: 14px; color: var(--dim); margin-bottom: 28px; line-height: 1.7; }

        .accordion { display: flex; flex-direction: column; margin-bottom: 20px; max-height: 44vh; overflow-y: auto; border: 1px solid var(--edge); border-radius: 6px; }
        .ai { border-bottom: 1px solid var(--edge); }
        .ai:last-child { border-bottom: none; }
        .ah { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--white); background: var(--card); transition: background 0.15s; user-select: none; }
        .ah:hover { background: var(--card2); }
        .an { font-family: var(--mn); font-size: 10px; color: var(--dim); margin-right: 10px; min-width: 16px; }
        .aw { font-size: 8px; color: var(--dim); transition: transform 0.25s; }
        .ai.open .aw { transform: rotate(180deg); color: var(--ice); }
        .ab { display: none; padding: 4px 16px 14px; font-size: 13px; color: var(--dim); line-height: 1.8; background: var(--card); }
        .ai.open .ab { display: block; }

        .checks { display: flex; flex-direction: column; gap: 10px; margin: 24px 0; padding-top: 20px; border-top: 1px solid var(--edge); }
        .ck { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
        .ck input { display: none; }
        .cb { width: 18px; height: 18px; border: 1.5px solid var(--edge); border-radius: 3px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.2s; margin-top: 3px; }
        .ck input:checked + .cb { background: var(--blue); border-color: var(--blue); }
        .ck input:checked + .cb::after { content: '✓'; color: #fff; font-size: 10px; font-weight: 700; }
        .ck-text { font-size: 13px; color: var(--soft); line-height: 1.5; }

        .fg { margin-bottom: 24px; }
        .fl { display: block; font-size: 12px; font-weight: 500; color: var(--white); margin-bottom: 8px; }
        .fl span { color: var(--dim); font-weight: 400; }
        .fi { width: 100%; padding: 13px 16px; background: var(--card); border: 1px solid var(--edge); border-radius: 6px; color: var(--white); font-family: var(--mn); font-size: 14px; outline: none; transition: border-color 0.25s, box-shadow 0.25s; }
        .fi::placeholder { color: var(--dim); font-family: var(--ss); font-size: 13px; }
        .fi:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(37,99,235,0.06); }
        .fi.err { border-color: var(--red); }
        .fe-show { font-size: 11px; color: var(--red); margin-top: 6px; }
        .fh { font-size: 11px; color: var(--dim); margin-top: 6px; line-height: 1.5; }

        .csel { display: flex; gap: 8px; }
        .co { flex: 1; padding: 14px 12px; background: var(--card); border: 1.5px solid var(--edge); border-radius: 6px; cursor: pointer; text-align: center; transition: all 0.2s; }
        .co:hover { border-color: rgba(147,197,253,0.12); }
        .co.sel { border-color: var(--blue); background: rgba(37,99,235,0.03); }
        .co-n { font-family: var(--dp); font-size: 12px; font-weight: 600; color: var(--white); margin-bottom: 2px; }
        .co-s { font-size: 11px; color: var(--dim); }

        .wallet-row { display: flex; align-items: center; gap: 10px; }
        .form-err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); color: var(--red); padding: 12px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }

        .conf { padding: 32px 0 0; }
        .conf-seal { width: 64px; height: 64px; border-radius: 50%; border: 1px solid var(--green); display: flex; align-items: center; justify-content: center; margin: 0 auto 32px; position: relative; }
        .conf-seal::before { content: ''; position: absolute; inset: -5px; border: 1px solid rgba(34,197,94,0.08); border-radius: 50%; }
        .conf-seal::after { content: '✓'; font-size: 22px; color: var(--green); }
        .conf-label { font-family: var(--mn); font-size: 9px; letter-spacing: 0.18em; color: var(--dim); text-transform: uppercase; margin-bottom: 20px; text-align: center; }
        .conf-t { font-family: var(--sf); font-size: 30px; font-weight: 300; color: var(--white); margin-bottom: 44px; text-align: center; }
        .conf-t em { font-style: italic; color: var(--ice); }
        .code-block { background: var(--card); border: 1px solid var(--edge); border-radius: 8px; padding: 32px 24px; margin-bottom: 8px; text-align: center; position: relative; overflow: hidden; }
        .code-block::before { content: ''; position: absolute; top: 0; left: 20%; right: 20%; height: 1px; background: linear-gradient(90deg, transparent, rgba(201,165,92,0.15), transparent); }
        .code-block-label { font-family: var(--mn); font-size: 9px; letter-spacing: 0.16em; color: var(--dim); text-transform: uppercase; margin-bottom: 12px; }
        .code-block-value { font-family: var(--dp); font-size: 36px; font-weight: 800; color: var(--white); letter-spacing: 0.05em; margin-bottom: 10px; }
        .code-block-link { font-family: var(--mn); font-size: 11px; color: var(--dim); word-break: break-all; }
        .conf-actions { display: flex; gap: 8px; margin: 28px 0 36px; }
        .conf-actions .btn { flex: 1; padding: 12px; font-size: 13px; margin-bottom: 0; }
        .conf-email { background: var(--card); border-left: 2px solid var(--edge); border-radius: 0 6px 6px 0; padding: 16px 20px; margin-bottom: 36px; font-size: 13px; color: var(--dim); line-height: 1.7; }
        .conf-email strong { color: var(--soft); font-weight: 500; }
        .conf-next { margin: 0 0 36px; }
        .conf-next p { font-size: 13px; color: var(--soft); line-height: 1.7; margin-bottom: 8px; padding-left: 14px; position: relative; }
        .conf-next p::before { content: '—'; position: absolute; left: 0; color: var(--dim); }
        .foot { padding: 28px 0 0; border-top: 1px solid var(--edge); margin-top: 32px; }
        .foot p { font-size: 11px; color: var(--dim); line-height: 1.7; }
        .foot .m { font-family: var(--mn); color: var(--ice); }

        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(0); background: var(--card); border: 1px solid var(--green); color: var(--green); font-size: 13px; font-weight: 500; padding: 10px 24px; border-radius: 6px; z-index: 100; pointer-events: none; }

        [data-lang="tc"] .greeting, [data-lang="tc"] .lp, [data-lang="tc"] .tc-t, [data-lang="tc"] .form-t, [data-lang="tc"] .conf-t { font-family: 'Noto Sans TC', var(--sf), serif; }
        [data-lang="sc"] .greeting, [data-lang="sc"] .lp, [data-lang="sc"] .tc-t, [data-lang="sc"] .form-t, [data-lang="sc"] .conf-t { font-family: 'Noto Sans SC', var(--sf), serif; }
        [data-lang="ko"] .greeting, [data-lang="ko"] .lp, [data-lang="ko"] .tc-t, [data-lang="ko"] .form-t, [data-lang="ko"] .conf-t { font-family: 'Noto Sans KR', var(--sf), serif; }
        [data-lang="vi"] .greeting, [data-lang="vi"] .lp, [data-lang="vi"] .tc-t, [data-lang="vi"] .form-t, [data-lang="vi"] .conf-t { font-family: 'Noto Sans', var(--sf), serif; }

        @media (min-width: 640px) {
          .app { padding: 40px 48px 80px; }
          .greeting { font-size: 42px; }
          .code-block-value { font-size: 44px; }
        }
        @media (min-width: 1024px) {
          .app { padding: 60px 48px 100px; }
          .lp { font-size: 22px; line-height: 1.9; }
          .greeting { font-size: 48px; }
          .tc-t, .form-t, .conf-t { font-size: 34px; }
          .sub { font-size: 15px; }
        }
      `}</style>
    </>
  );
}
