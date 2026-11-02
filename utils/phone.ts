/**
 * Shared Indian mobile-number helper.
 * Accepts "9876543210", "+91 98765 43210", "09876543210" and "919876543210".
 */
export function normalizeIndianPhone(raw: unknown): { e164: string; digits10: string } | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  let national = digits;
  if (digits.length === 12 && digits.startsWith('91')) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return { e164: `+91${national}`, digits10: national };
}
