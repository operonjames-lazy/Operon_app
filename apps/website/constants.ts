declare const process: { env: { DASHBOARD_URL?: string } };

export const DASHBOARD_URL: string =
  (typeof process !== 'undefined' && process.env.DASHBOARD_URL) || 'http://localhost:3001';

export const CONNECT_URL: string = `${DASHBOARD_URL}/?connect=1`;
