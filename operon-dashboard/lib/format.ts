/** Format cents as USD — e.g. 44625 → "$446.25" */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format cents as whole dollars — e.g. 44625 → "$446" */
export function formatUsdShort(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString('en-US')}`;
}

/** Format number with commas — e.g. 1250 → "1,250" */
export function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}
