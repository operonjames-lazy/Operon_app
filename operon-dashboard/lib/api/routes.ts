export const API_ROUTES = {
  AUTH_WALLET: '/api/auth/wallet',
  AUTH_REFRESH: '/api/auth/refresh',
  HOME_SUMMARY: '/api/home/summary',
  SALE_STATUS: '/api/sale/status',
  SALE_VALIDATE_CODE: '/api/sale/validate-code',
  SALE_TIERS: '/api/sale/tiers',
  NODES_MINE: '/api/nodes/mine',
  REFERRALS_SUMMARY: '/api/referrals/summary',
  REFERRALS_ACTIVITY: '/api/referrals/activity',
  REFERRALS_PAYOUTS: '/api/referrals/payouts',
  EPP_VALIDATE: '/api/epp/validate',
  EPP_CREATE: '/api/epp/create',
  CRON_RECONCILE: '/api/cron/reconcile',
} as const;

export type ApiRoute = (typeof API_ROUTES)[keyof typeof API_ROUTES];
