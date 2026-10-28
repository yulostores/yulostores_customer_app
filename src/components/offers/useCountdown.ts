/**
 * useCountdown — milliseconds left until `endIso`, re-rendering every second while mounted
 * (offers last minutes; the last minute counts down in seconds — src/lib/offerText.ts).
 */
import { useEffect, useState } from 'react';

export function useCountdown(endIso: string | null | undefined): number {
  const end = endIso ? Date.parse(endIso) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(end)) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);
  return Number.isFinite(end) ? end - now : 0;
}
