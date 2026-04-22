import { create } from 'zustand';

/**
 * Pending referral code captured from `?ref=` in the URL.
 *
 * Lives in sessionStorage so it survives:
 *   - in-app navigation between pages
 *   - the wallet-connect modal opening/closing
 *   - the SIWE signature flow
 *
 * BUT does NOT persist across browser sessions: a referral link is meant
 * to be acted on in the same visit, not weeks later.
 *
 * It is consumed once at first SIWE signin and then cleared. After that
 * the referrer is fixed in the database and we never read this again for
 * that user.
 */

const STORAGE_KEY = 'operon_pending_ref';

interface ReferralState {
  pendingCode: string | null;
  setPendingCode: (code: string | null) => void;
  clearPendingCode: () => void;
  hydrate: () => void;
}

function readFromSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToSession(value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // ignore quota / private mode errors
  }
}

export const useReferralCodeStore = create<ReferralState>((set) => ({
  pendingCode: null,
  setPendingCode: (code) => {
    writeToSession(code);
    set({ pendingCode: code });
  },
  clearPendingCode: () => {
    writeToSession(null);
    set({ pendingCode: null });
  },
  hydrate: () => {
    const stored = readFromSession();
    if (stored) set({ pendingCode: stored });
  },
}));
