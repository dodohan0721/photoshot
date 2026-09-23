export type HistogramChannel = 'rgb' | 'r' | 'g' | 'b';
export type ToneAnalysis = {
  channelBins: Record<HistogramChannel, number[]>;
  bins: number[];
  count: number;
  median: number;
  low: number;
  high: number;
  brightness: number;
  contrast: number;
};
export function analyzeTones(data: Uint8ClampedArray): ToneAnalysis {
  const bins = Array<number>(256).fill(0);
  const channelBins: Record<HistogramChannel, number[]> = {
    rgb: Array(256).fill(0),
    r: Array(256).fill(0),
    g: Array(256).fill(0),
    b: Array(256).fill(0),
  };
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const weight = data[i + 3] / 255;
    if (!weight) continue;
    bins[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])] += weight;
    channelBins.r[data[i]] += weight;
    channelBins.g[data[i + 1]] += weight;
    channelBins.b[data[i + 2]] += weight;
    count += weight;
  }
  // RGB shows the distribution of channel values, not the luminance histogram.
  for (let i = 0; i < 256; i++)
    channelBins.rgb[i] = (channelBins.r[i] + channelBins.g[i] + channelBins.b[i]) / 3;
  const quantile = (q: number) => {
    let n = 0;
    for (let i = 0; i < 256; i++) {
      n += bins[i];
      if (n >= count * q) return i;
    }
    return 255;
  };
  if (!count)
    return { channelBins, bins, count, median: 0, low: 0, high: 0, brightness: 0, contrast: 0 };
  const median = quantile(0.5),
    low = quantile(0.02),
    high = quantile(0.98),
    m = median / 255;
  // Conservative histogram suggestion; matches this editor's own brightness/contrast mapping.
  const brightness = Math.round(
    Math.max(-60, Math.min(60, (100 * (0.5 - m)) / (m < 0.5 ? 1 - m : Math.max(m, 0.001)))),
  );
  const bright = (x: number) =>
    brightness < 0 ? x * (1 + brightness / 100) : x + ((1 - x) * brightness) / 100;
  const span = bright(high / 255) - bright(low / 255);
  const factor = span > 0.08 ? 0.8 / span : 1;
  const contrast = Math.round(
    Math.max(-40, Math.min(40, factor < 1 ? (factor - 1) * 100 : 101 * (1 - 1 / factor))),
  );
  return { channelBins, bins, count, median, low, high, brightness, contrast };
}
