/**
 * flexiblePolyline.ts — decodes HERE's Flexible Polyline format.
 *
 * The backend sends a route as one encoded string rather than an array of coordinates
 * (src/services/tracking.ts → `route.polyline`). A city route is a few hundred points; as JSON
 * that is tens of kilobytes on every tracking refresh, and encoded it is a few hundred bytes. On
 * a phone with patchy mobile data that difference is the whole reason the format exists.
 *
 * NOT the same as Google's Encoded Polyline Algorithm, despite the family resemblance. Both use
 * zig-zag varints over a 64-character alphabet, but Flexible Polyline prepends a header carrying
 * the coordinate precision (Google hardcodes 1e5) and an optional third dimension, and it uses a
 * different alphabet. Decoding one with the other's routine yields plausible-looking numbers that
 * plot somewhere in the wrong hemisphere, so they are not interchangeable.
 *
 * Reference: https://github.com/heremaps/flexible-polyline
 */

/**
 * Character → 6-bit value, indexed by `charCodeAt(0) - 45`, so index 0 is '-'.
 * -1 marks a byte that is not part of the alphabet.
 *
 * Taken verbatim from HERE's reference implementation rather than derived from the alphabet
 * string: the last two entries ('-' = 62, '_' = 63) are the reverse of the order they appear in
 * several third-party write-ups, and getting them backwards corrupts roughly one character in
 * thirty — enough to bend a route without obviously breaking it.
 */
const DECODING_TABLE = [
  62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
];

const FORMAT_VERSION = 1;

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

/** Reads every varint out of the encoded string. Returns null if any character is invalid. */
function decodeUnsignedValues(encoded: string): number[] | null {
  const values: number[] = [];
  let result = 0;
  let shift = 0;

  for (let i = 0; i < encoded.length; i += 1) {
    const value = DECODING_TABLE[encoded.charCodeAt(i) - 45];
    if (value === undefined || value === -1) return null;

    // 0x1f masks off the continuation bit; 0x20 tests it. A clear continuation bit ends the
    // current number.
    result |= (value & 0x1f) << shift;
    if (value & 0x20) {
      shift += 5;
    } else {
      values.push(result);
      result = 0;
      shift = 0;
    }
  }

  // A trailing partial number means the string was truncated mid-varint.
  return shift === 0 ? values : null;
}

/**
 * Undoes zig-zag encoding, where the low bit carries the sign so that small negative numbers stay
 * small: -1 encodes as 1, 1 as 2. An odd value means negative.
 */
const toSigned = (value: number) => (value & 1 ? ~(value >> 1) : value >> 1);

/**
 * Decodes an encoded polyline into map coordinates.
 *
 * Returns `[]` for an empty, malformed or unsupported-version string rather than throwing — a
 * corrupt route should cost the map its route line, not crash the tracking screen the customer is
 * actively watching.
 */
export function decodeFlexiblePolyline(encoded: string | null | undefined): LatLngPoint[] {
  if (!encoded) return [];

  const values = decodeUnsignedValues(encoded);
  // Two header varints plus at least one coordinate pair.
  if (!values || values.length < 4) return [];

  const [version, header] = values;
  if (version !== FORMAT_VERSION) return [];

  const precision = header & 15;
  // A third dimension (elevation, or a custom value) may be present. This app requests 2D routes,
  // but the field has to be read to know the stride through the remaining values — assuming pairs
  // when the encoder wrote triples silently shreds the line.
  const thirdDim = (header >> 4) & 7;
  const stride = thirdDim ? 3 : 2;

  const scale = 10 ** precision;
  const points: LatLngPoint[] = [];

  // Every coordinate is stored as a delta from the previous one, so decoding is a running sum.
  let lat = 0;
  let lng = 0;

  for (let i = 2; i + stride - 1 < values.length; i += stride) {
    lat += toSigned(values[i]);
    lng += toSigned(values[i + 1]);
    points.push({ latitude: lat / scale, longitude: lng / scale });
  }

  return points;
}

/** GeoJSON `[lng, lat]` pairs, the order MapLibre's shape sources expect. */
export const toLngLatPairs = (points: LatLngPoint[]): [number, number][] =>
  points.map(({ latitude, longitude }) => [longitude, latitude]);
