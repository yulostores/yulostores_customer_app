/**
 * deliveryEta.ts — the one delivery-time estimate every screen shows.
 *
 * Home and the restaurant page used to compute this two different ways: Home took a fixed
 * 15-minute kitchen head start plus travel time, the restaurant page took the owner's declared
 * prep time and ignored travel. The same restaurant read "15-20 min" on one and "35–40 min" on
 * the other. Both now go through here: the owner's prep+handover estimate (or the default head
 * start when they haven't set one) plus the ride from the restaurant to the customer.
 */

/** Rider speed through city traffic. */
const AVG_SPEED_KMPH = 20;
/** Kitchen head start when the restaurant hasn't declared its own. */
const DEFAULT_PREP_MINUTES = 15;

const known = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/**
 * "35–40 min", or null when neither the prep time nor the distance is known — the caller then
 * drops the line rather than printing a guess.
 *
 * @param prepMinutes  the restaurant's `delivery.estimatedMinutes` (prep + handover)
 * @param distanceKm   restaurant → delivery address
 */
export function deliveryEtaWindow(
  prepMinutes: number | null | undefined,
  distanceKm: number | null | undefined,
): string | null {
  const hasPrep = known(prepMinutes) && prepMinutes > 0;
  const hasDistance = known(distanceKm);
  if (!hasPrep && !hasDistance) return null;

  const prep = hasPrep ? prepMinutes : DEFAULT_PREP_MINUTES;
  const travel = hasDistance ? (distanceKm / AVG_SPEED_KMPH) * 60 : 0;
  const mins = Math.max(10, Math.round((prep + travel) / 5) * 5);
  return `${mins}–${mins + 5} min`;
}
