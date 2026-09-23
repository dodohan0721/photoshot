const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
// The middle handle marks the input that becomes 50% after inverse gamma.
export function gammaPosition(black: number, white: number, gamma: number) {
  return black + (white - black) * Math.pow(0.5, clamp(gamma, 0.1, 10));
}
export function gammaAtPosition(black: number, white: number, position: number) {
  const t = clamp(
    (position - black) / Math.max(1, white - black),
    Math.pow(0.5, 10),
    Math.pow(0.5, 0.1),
  );
  return Math.round(clamp(Math.log(t) / Math.log(0.5), 0.1, 10) * 100) / 100;
}
export function levelsHistogramPath(bins: readonly number[], logarithmic = false) {
  const heights = bins.map((n) => (logarithmic ? Math.log1p(n) : n)),
    peak = Math.max(0, ...heights);
  if (!peak) return '';
  return (
    'M 0 112 ' +
    heights
      .map((n, i) => `L ${i} ${112 - (n / peak) * 108} L ${i + 1} ${112 - (n / peak) * 108}`)
      .join(' ') +
    ' L 256 112 Z'
  );
}
