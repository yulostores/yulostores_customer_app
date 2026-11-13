/**
 * qrMatrix.ts — a QR code as rows of dark/light modules, drawn by the app with plain Views (no
 * native SVG module, so it ships over the air). Encoder: qrcode-generator (MIT, pure JS).
 */
import qrcode from 'qrcode-generator';

/** The modules of `text`'s QR code (error correction M, smallest version that fits). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** One row as runs of dark modules — `[start, length]` — so a row is a few Views, not one per module. */
export function darkRuns(row: boolean[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  row.forEach((dark, i) => {
    if (dark && start < 0) start = i;
    if (!dark && start >= 0) {
      runs.push([start, i - start]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, row.length - start]);
  return runs;
}
