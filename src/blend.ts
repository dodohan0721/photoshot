export const blendNames = {
  normal: '표준',
  dissolve: '디졸브',
  darken: '어둡게',
  multiply: '곱하기',
  'color-burn': '색상 번',
  'linear-burn': '선형 번',
  'darker-color': '어두운 색상',
  lighten: '밝게',
  screen: '스크린',
  'color-dodge': '색상 닷지',
  'linear-dodge': '선형 닷지',
  'lighter-color': '밝은 색상',
  overlay: '오버레이',
  'soft-light': '소프트 라이트',
  'hard-light': '하드 라이트',
  'vivid-light': '선명한 라이트',
  'linear-light': '선형 라이트',
  'pin-light': '핀 라이트',
  'hard-mix': '하드 믹스',
  difference: '차이',
  exclusion: '제외',
  subtract: '빼기',
  divide: '나누기',
  hue: '색조',
  saturation: '채도',
  color: '색상',
  luminosity: '광도',
} as const;
export type BlendMode = keyof typeof blendNames;
type RGB = [number, number, number];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const sat = (c: RGB) => Math.max(...c) - Math.min(...c);
function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c),
    x = c.map((v) => v + d) as RGB,
    n = Math.min(...x),
    m = Math.max(...x);
  if (n < 0) for (let i = 0; i < 3; i++) x[i] = l + ((x[i] - l) * l) / (l - n);
  if (m > 1) for (let i = 0; i < 3; i++) x[i] = l + ((x[i] - l) * (1 - l)) / (m - l);
  return x;
}
function setSat(c: RGB, s: number): RGB {
  const order = [0, 1, 2].sort((a, b) => c[a] - c[b]),
    [lo, mid, hi] = order,
    x: [number, number, number] = [0, 0, 0];
  if (c[hi] > c[lo]) {
    x[mid] = ((c[mid] - c[lo]) * s) / (c[hi] - c[lo]);
    x[hi] = s;
  }
  return x;
}
const burn = (b: number, s: number) => (s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
const dodge = (b: number, s: number) => (s >= 1 ? 1 : Math.min(1, b / (1 - s)));
export function blendRGB(base: RGB, source: RGB, mode: BlendMode, out: RGB): RGB {
  let mixed: RGB | undefined;
  if (mode === 'hue') mixed = setLum(setSat(source, sat(base)), lum(base));
  else if (mode === 'saturation') mixed = setLum(setSat(base, sat(source)), lum(base));
  else if (mode === 'color') mixed = setLum(source, lum(base));
  else if (mode === 'luminosity') mixed = setLum(base, lum(source));
  else if (mode === 'darker-color') mixed = lum(base) <= lum(source) ? base : source;
  else if (mode === 'lighter-color') mixed = lum(base) >= lum(source) ? base : source;
  for (let i = 0; i < 3; i++) {
    const b = base[i],
      s = source[i];
    let v = mixed?.[i] ?? s;
    switch (mode) {
      case 'darken':
        v = Math.min(b, s);
        break;
      case 'multiply':
        v = b * s;
        break;
      case 'color-burn':
        v = burn(b, s);
        break;
      case 'linear-burn':
        v = b + s - 1;
        break;
      case 'lighten':
        v = Math.max(b, s);
        break;
      case 'screen':
        v = b + s - b * s;
        break;
      case 'color-dodge':
        v = dodge(b, s);
        break;
      case 'linear-dodge':
        v = b + s;
        break;
      case 'overlay':
        v = b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
        break;
      case 'hard-light':
        v = s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
        break;
      case 'soft-light':
        v =
          s <= 0.5
            ? b - (1 - 2 * s) * b * (1 - b)
            : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
        break;
      case 'vivid-light':
      case 'hard-mix':
        v = s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * s - 1);
        if (mode === 'hard-mix') v = v < 0.5 ? 0 : 1;
        break;
      case 'linear-light':
        v = b + 2 * s - 1;
        break;
      case 'pin-light':
        v = s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1);
        break;
      case 'difference':
        v = Math.abs(b - s);
        break;
      case 'exclusion':
        v = b + s - 2 * b * s;
        break;
      case 'subtract':
        v = b - s;
        break;
      case 'divide':
        v = s === 0 ? 1 : b / s;
        break;
    }
    out[i] = clamp(v);
  }
  return out;
}
export function pixelNoise(index: number) {
  let n = Math.imul(index + 1, 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
// Straight-alpha source-over with the blend restricted to the overlap (W3C compositing).
export function compositeBlend(
  dst: Uint8ClampedArray,
  src: Uint8ClampedArray,
  opacity: number,
  mode: BlendMode,
) {
  const b: RGB = [0, 0, 0],
    s: RGB = [0, 0, 0],
    out: RGB = [0, 0, 0];
  for (let i = 0; i < dst.length; i += 4) {
    let as = (src[i + 3] / 255) * opacity;
    const ab = dst[i + 3] / 255;
    if (mode === 'dissolve') as = pixelNoise(i / 4) < as ? 1 : 0;
    if (!as) continue;
    for (let k = 0; k < 3; k++) {
      b[k] = dst[i + k] / 255;
      s[k] = src[i + k] / 255;
    }
    blendRGB(b, s, mode, out);
    const alpha = as + ab * (1 - as);
    for (let k = 0; k < 3; k++)
      dst[i + k] = Math.round(
        (((1 - as) * ab * b[k] + as * ((1 - ab) * s[k] + ab * out[k])) / alpha) * 255,
      );
    dst[i + 3] = Math.round(alpha * 255);
  }
}
