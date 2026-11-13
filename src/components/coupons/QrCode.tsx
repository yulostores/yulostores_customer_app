/**
 * QrCode — the coupon's QR, drawn with plain Views (src/lib/qrMatrix.ts): one View per run of
 * dark modules, on a white square with the 4-module quiet zone scanners need.
 */
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { darkRuns, qrMatrix } from '../../lib/qrMatrix';

const QUIET = 4;

export const QrCode = memo(function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const rows = useMemo(() => qrMatrix(value).map(darkRuns), [value]);
  const modules = rows.length + QUIET * 2;
  const cell = Math.floor(size / modules);
  const side = cell * modules;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`QR code for coupon ${value}`}
      style={{ width: side, height: side, backgroundColor: '#FFFFFF', padding: cell * QUIET }}
    >
      {rows.map((runs, r) => (
        <View key={r} style={{ height: cell, flexDirection: 'row' }}>
          {runs.map(([start, len], i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: start * cell,
                width: len * cell,
                height: cell,
                backgroundColor: '#000000',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
});
