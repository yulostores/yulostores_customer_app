/**
 * demographics.ts — the customer's optional gender and date of birth (PATCH /api/users/me).
 * Partner shops see only an age band and gender in their reports, never the date itself.
 * Pure, so it runs under `npm run test:coupons`.
 */

export type Gender = 'male' | 'female' | 'other';

export const GENDER_OPTIONS: ReadonlyArray<{ value: Gender; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
];

export const WHY_WE_ASK =
  'Optional. It helps nearby shops pick offers for people like you — they only ever see an age group, never your birthday or number.';

export const MIN_AGE = 13;
export const MAX_AGE = 110;

/** Typing aid: digits only, slashes added as you go — "0105199" → "01/05/199". */
export function maskDobInput(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Today's calendar date in India, "YYYY-MM-DD" (the backend reckons age the same way). */
export function todayIst(now: number = Date.now()): string {
  return new Date(now + 5.5 * 60 * 60_000).toISOString().slice(0, 10);
}

/** Whole years from `ymd` to `onYmd`. */
export function ageOn(ymd: string, onYmd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const [ty, tm, td] = onYmd.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export type DobResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * "DD/MM/YYYY" → "YYYY-MM-DD". Blank is fine (`null`: not given / cleared). Same rules as the
 * server: a real date and an age of 13–110 on today's date in India.
 */
export function parseDob(display: string, now: number = Date.now()): DobResult {
  const text = display.trim();
  if (!text) return { ok: true, value: null };
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { ok: false, error: 'Enter your date of birth as DD/MM/YYYY' };
  const ymd = `${m[3]}-${m[2]}-${m[1]}`;
  const date = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ymd)
    return { ok: false, error: 'Enter a real date of birth' };
  const age = ageOn(ymd, todayIst(now));
  if (age < MIN_AGE || age > MAX_AGE) return { ok: false, error: `Age must be between ${MIN_AGE} and ${MAX_AGE}` };
  return { ok: true, value: ymd };
}

/** The stored date ("1998-05-01T00:00:00.000Z" or "1998-05-01") → "01/05/1998"; '' when unset. */
export function dobForInput(stored: string | null | undefined): string {
  const m = (stored ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** The stored date as "YYYY-MM-DD", or null. */
export function dobYmd(stored: string | null | undefined): string | null {
  const m = (stored ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export const isGender = (v: unknown): v is Gender => v === 'male' || v === 'female' || v === 'other';

/**
 * Whether to show the one-time "tell us about you" prompt: the customer has a coupon, has given
 * neither gender nor date of birth, and has never been asked.
 */
export function shouldAskDemographics(p: {
  hasCoupon: boolean;
  gender: Gender | null;
  dateOfBirth: string | null;
  alreadyAsked: boolean;
}): boolean {
  return p.hasCoupon && !p.alreadyAsked && p.gender == null && p.dateOfBirth == null;
}
