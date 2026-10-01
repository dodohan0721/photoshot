import { applyVibranceResponse } from './vibrance-response.ts';
import { balanceResponse } from './balance-response.ts';
import { toneResponse, sampleResponse } from './tone-response.ts';
import { blendRGB, pixelNoise, type BlendMode } from './blend.ts';
// RGB adjustment engine. Older projects retain their original rendering formulas.
import { validateCube, shaperValue, type Cube } from './lut.ts';
export { parseCube, parseLut, MAX_LUT_BYTES } from './lut.ts';
export type { Cube } from './lut.ts';
export type HueBand = {
  center: number;
  width: number;
  feather: number;
  hue: number;
  saturation: number;
  lightness: number;
};
export type GradientStop = { position: number; color: string; midpoint: number };
export type Channel = 'rgb' | 'r' | 'g' | 'b';
export type CurvePoint = { x: number; y: number };

export type AdjustmentType =
  | 'brightness'
  | 'levels'
  | 'curves'
  | 'exposure'
  | 'vibrance'
  | 'hsl'
  | 'balance'
  | 'blackwhite'
  | 'photo'
  | 'mixer'
  | 'lookup'
  | 'invert'
  | 'posterize'
  | 'threshold'
  | 'gradient'
  | 'selective';
export type Adjustment = {
  type: AdjustmentType;
  scope: 'below' | 'clipped';
  values: Record<string, number>;
  curves?: Record<Channel, CurvePoint[]>;
  colors?: string[];
  cube?: Cube;
  revision?: 2;
  bands?: HueBand[];
  stops?: GradientStop[];
};
export type Control = {
  key: string;
  label: string;
  min: number;
  max: number;
  initial: number;
  step?: number;
  group?: string;
};
const control = (
  key: string,
  label: string,
  min: number,
  max: number,
  initial = 0,
  step = 1,
  group?: string,
): Control => ({ key, label, min, max, initial, step, group });
export const channels: Channel[] = ['rgb', 'r', 'g', 'b'];
export const colorNames = [
  '빨강',
  '노랑',
  '초록',
  '청록',
  '파랑',
  '자홍',
  '흰색',
  '중간색',
  '검정',
];
export const definitions: Record<
  AdjustmentType,
  { name: string; description: string; controls: Control[] }
> = {
  brightness: {
    name: '밝기 / 대비',
    description: '중간 밝기와 명암 차이를 조절합니다.',
    controls: [
      control('brightness', '밝기', -150, 150),
      control('contrast', '대비', -100, 100),
      control('legacy', '이전 방식 사용', 0, 1),
    ],
  },
  levels: {
    name: '레벨',
    description: '입력·출력 범위와 중간톤을 채널별로 조절합니다.',
    controls: channels.flatMap((c) => [
      control(c + 'Black', '입력 검정', 0, 254, 0, 1, c),
      control(c + 'Gamma', '중간톤', 0.1, 10, 1, 0.01, c),
      control(c + 'White', '입력 흰색', 1, 255, 255, 1, c),
      control(c + 'OutBlack', '출력 검정', 0, 255, 0, 1, c),
      control(c + 'OutWhite', '출력 흰색', 0, 255, 255, 1, c),
    ]),
  },
  curves: {
    name: '곡선',
    description: '선을 클릭해 점을 추가하고 드래그해 명암을 조절합니다.',
    controls: [],
  },
  exposure: {
    name: '노출',
    description: '노출(EV), 오프셋과 감마를 조절합니다.',
    controls: [
      control('ev', '노출 (EV)', -20, 20, 0, 0.01),
      control('offset', '오프셋', -0.5, 0.5, 0, 0.0001),
      control('gamma', '감마', 0.01, 9.99, 1, 0.01),
    ],
  },
  vibrance: {
    name: '활기',
    description: '채도가 낮은 색을 중심으로 생동감을 조절합니다.',
    controls: [
      control('vibrance', '활기', -100, 100),
      control('saturation', '채도', -100, 100),
      control('skin', '피부색 보호', 0, 1, 1),
    ],
  },
  hsl: {
    name: '색조 / 채도',
    description: '색상환의 색조, 채도와 명도를 조절합니다.',
    controls: [
      control('hue', '색조', -180, 180),
      control('saturation', '채도', -100, 100),
      control('lightness', '명도', -100, 100),
      control('colorize', '색상화 (Colorize)', 0, 1),
      control('colorizeHue', '색상화 색조', 0, 360, 0),
      control('colorizeSaturation', '색상화 채도', 0, 100, 25),
    ],
  },
  balance: {
    name: '색상 균형',
    description: '어두운 영역·중간톤·밝은 영역의 색 균형을 조절합니다.',
    controls: ['shadows', 'midtones', 'highlights']
      .flatMap((g) => [
        control(g + 'R', '청록 ↔ 빨강', -100, 100, 0, 1, g),
        control(g + 'G', '자홍 ↔ 초록', -100, 100, 0, 1, g),
        control(g + 'B', '노랑 ↔ 파랑', -100, 100, 0, 1, g),
      ])
      .concat(control('preserve', '명도 유지', 0, 1, 1)),
  },
  blackwhite: {
    name: '흑백',
    description: '원본의 색상별 밝기를 조절하며 흑백으로 변환합니다.',
    controls: colorNames
      .slice(0, 6)
      .map((n, i) => control('color' + i, n, -100, 300, [40, 60, 40, 60, 20, 80][i]))
      .concat(
        control('tint', '색조 입히기', 0, 1),
        control('tintHue', '색조', 0, 360, 40),
        control('tintSaturation', '색조 채도', 0, 100, 25),
      ),
  },
  photo: {
    name: '포토 필터',
    description: '원하는 필터 색과 농도로 색감을 더합니다.',
    controls: [control('density', '농도', 0, 100, 25), control('preserve', '명도 유지', 0, 1, 1)],
  },
  mixer: {
    name: '채널 혼합',
    description: '출력 채널을 원본 RGB 채널의 비율로 만듭니다.',
    controls: ['r', 'g', 'b']
      .flatMap((c) =>
        ['R', 'G', 'B', 'Constant'].map((v, i) =>
          control(
            c + v,
            ['빨강', '초록', '파랑', '상수'][i],
            -200,
            200,
            c === v.toLowerCase() ? 100 : 0,
            1,
            c,
          ),
        ),
      )
      .concat(control('mono', '단색', 0, 1)),
  },
  lookup: {
    name: '컬러 룩업 (LUT)',
    description: 'CUBE·3DL·LOOK·CSP·ICC 색상 표를 불러와 적용합니다.',
    controls: [control('interpolation', '사면체 보간', 0, 1, 1), control('dither', '디더링', 0, 1)],
  },
  invert: { name: '반전', description: 'RGB 색상을 반전합니다.', controls: [] },
  posterize: {
    name: '포스터화',
    description: '각 채널의 명암 단계 수를 줄입니다.',
    controls: [control('steps', '단계', 2, 256, 6)],
  },
  threshold: {
    name: '한계값',
    description: '기준 밝기에 따라 검정과 흰색으로 나눕니다.',
    controls: [control('threshold', '한계값', 0, 255, 128)],
  },
  gradient: {
    name: '그레이디언트 맵',
    description: '명암을 여러 색상으로 매핑하고 중간점을 조절합니다.',
    controls: [
      control('reverse', '반전', 0, 1),
      control('dither', '디더링', 0, 1),
      control('smooth', '매끄러움', 0, 100, 100),
    ],
  },
  selective: {
    name: '선택 색상',
    description: '색상 계열별로 청록·자홍·노랑·검정 성분을 조절합니다.',
    controls: colorNames
      .flatMap((_, i) =>
        ['C', 'M', 'Y', 'K'].map((c, j) =>
          control(i + c, ['청록', '자홍', '노랑', '검정'][j], -100, 100, 0, 1, String(i)),
        ),
      )
      .concat(control('relative', '상대값', 0, 1, 1)),
  },
};
export const adjustmentTypes = Object.keys(definitions) as AdjustmentType[];
export function makeAdjustment(type: AdjustmentType): Adjustment {
  const a: Adjustment = {
    type,
    revision: 2,
    scope: 'below',
    values: Object.fromEntries(definitions[type].controls.map((c) => [c.key, c.initial])),
  };
  if (type === 'curves')
    a.curves = Object.fromEntries(
      channels.map((c) => [
        c,
        [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
      ]),
    ) as Record<Channel, CurvePoint[]>;
  if (type === 'photo') a.colors = ['#ec8a35'];
  if (type === 'gradient') a.colors = ['#000000', '#ffffff'];
  if (type === 'hsl')
    a.bands = Array.from({ length: 6 }, (_, i) => ({
      center: i * 60,
      width: 30,
      feather: 30,
      hue: 0,
      saturation: 0,
      lightness: 0,
    }));
  return a;
}
export function isIdentityAdjustment(a: Adjustment): boolean {
  if (a.type === 'lookup') return !a.cube;
  if (a.type === 'curves') return channels.every((c) => a.curves![c].every((p) => p.x === p.y));
  if (a.type === 'photo') return a.values.density === 0;
  if (['blackwhite', 'gradient', 'invert', 'posterize', 'threshold'].includes(a.type)) return false;
  if (a.bands?.some((b) => b.hue || b.saturation || b.lightness)) return false;
  return definitions[a.type].controls.every(
    (c) =>
      ['preserve', 'relative', 'skin', 'legacy', 'colorizeHue', 'colorizeSaturation'].includes(
        c.key,
      ) || (a.values[c.key] ?? c.initial) === c.initial,
  );
}
const clamp = (x: number, low = 0, high = 1) => Math.max(low, Math.min(high, x));
const finite = (v: unknown, a: number, b: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
export function validateAdjustment(value: unknown): asserts value is Adjustment {
  const a = value as Adjustment;
  if (
    !a ||
    !Object.hasOwn(definitions, a.type) ||
    !['below', 'clipped'].includes(a.scope) ||
    !a.values ||
    typeof a.values !== 'object' ||
    Array.isArray(a.values)
  )
    throw Error('조정 레이어 종류가 올바르지 않습니다.');
  const specs = definitions[a.type].controls;
  const optional = new Set([
    'legacy',
    'skin',
    'colorize',
    'colorizeHue',
    'colorizeSaturation',
    'tint',
    'tintHue',
    'tintSaturation',
    'interpolation',
    'dither',
    'smooth',
  ]);
  if (
    Object.keys(a.values).some((k) => !specs.some((c) => c.key === k)) ||
    specs.some(
      (c) =>
        !(a.values[c.key] === undefined && optional.has(c.key)) &&
        (!finite(a.values[c.key], c.min, c.max) ||
          ((c.step ?? 1) === 1 && !Number.isInteger(a.values[c.key]))),
    )
  )
    throw Error('조정 수치가 허용 범위를 벗어났습니다.');
  if (a.type === 'levels' && channels.some((c) => a.values[c + 'Black'] >= a.values[c + 'White']))
    throw Error('레벨의 입력 검정은 입력 흰색보다 작아야 합니다.');
  if (a.type === 'curves') {
    if (
      !a.curves ||
      channels.some((c) => {
        const p = a.curves?.[c];
        return (
          !Array.isArray(p) ||
          p.length < 2 ||
          p.length > 256 ||
          p[0]?.x !== 0 ||
          p.at(-1)?.x !== 255 ||
          p.some(
            (v, i) =>
              !v || !finite(v.x, 0, 255) || !finite(v.y, 0, 255) || (i > 0 && v.x <= p[i - 1].x),
          )
        );
      })
    )
      throw Error('곡선 점 데이터가 올바르지 않습니다.');
  } else if (a.curves !== undefined) throw Error('이 조정에는 곡선 데이터가 필요하지 않습니다.');
  const count = a.type === 'photo' ? 1 : a.type === 'gradient' ? 2 : 0;
  if (
    count
      ? !Array.isArray(a.colors) ||
        a.colors.length !== count ||
        a.colors.some((c) => typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c))
      : a.colors !== undefined
  )
    throw Error('조정 색상 데이터가 올바르지 않습니다.');
  if (a.revision !== undefined && a.revision !== 2) throw Error('지원하지 않는 조정 버전입니다.');
  if (
    a.bands !== undefined &&
    (a.type !== 'hsl' ||
      !Array.isArray(a.bands) ||
      a.bands.length !== 6 ||
      a.bands.some(
        (b) =>
          !b ||
          !finite(b.center, 0, 360) ||
          !finite(b.width, 0, 180) ||
          !finite(b.feather, 1, 180) ||
          !finite(b.hue, -180, 180) ||
          !finite(b.saturation, -100, 100) ||
          !finite(b.lightness, -100, 100),
      ))
  )
    throw Error('색상 범위가 올바르지 않습니다.');
  if (
    a.stops !== undefined &&
    (a.type !== 'gradient' ||
      !Array.isArray(a.stops) ||
      a.stops.length < 2 ||
      a.stops.length > 32 ||
      a.stops[0].position !== 0 ||
      a.stops.at(-1)!.position !== 100 ||
      a.stops.some(
        (s, i) =>
          !s ||
          !finite(s.position, 0, 100) ||
          !finite(s.midpoint, 1, 99) ||
          !/^#[0-9a-f]{6}$/i.test(s.color) ||
          (i > 0 && s.position <= a.stops![i - 1].position),
      ))
  )
    throw Error('그레이디언트 색상점이 올바르지 않습니다.');
  if (a.cube) {
    if (a.type !== 'lookup') throw Error('LUT는 컬러 룩업에서만 사용합니다.');
    validateCube(a.cube);
  }
}
// Shape-preserving cubic Hermite interpolation: avoids spline overshoot around sharp edits.
export function curveTable(points: CurvePoint[]): Float64Array {
  const n = points.length,
    d = points.slice(1).map((p, i) => (p.y - points[i].y) / (p.x - points[i].x));
  const m = points.map((_, i) =>
    i === 0
      ? d[0]
      : i === n - 1
        ? d[n - 2]
        : d[i - 1] * d[i] <= 0
          ? 0
          : 2 / (1 / d[i - 1] + 1 / d[i]),
  );
  const out = new Float64Array(256);
  let j = 0;
  for (let x = 0; x < 256; x++) {
    while (j < n - 2 && x > points[j + 1].x) j++;
    const a = points[j],
      b = points[j + 1],
      h = b.x - a.x,
      t = (x - a.x) / h;
    out[x] =
      clamp(
        (2 * t ** 3 - 3 * t * t + 1) * a.y +
          (t ** 3 - 2 * t * t + t) * h * m[j] +
          (-2 * t ** 3 + 3 * t * t) * b.y +
          (t ** 3 - t * t) * h * m[j + 1],
        0,
        255,
      ) / 255;
  }
  return out;
}
// Natural cubic spline used by the upgraded point-curve editor; old projects keep Hermite.
export function naturalCurveTable(points: CurvePoint[]): Float64Array {
  const n = points.length,
    y2 = Array(n).fill(0),
    u = Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const span = points[i + 1].x - points[i - 1].x,
      sig = (points[i].x - points[i - 1].x) / span,
      p = sig * y2[i - 1] + 2;
    y2[i] = (sig - 1) / p;
    const slope =
      (points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x) -
      (points[i].y - points[i - 1].y) / (points[i].x - points[i - 1].x);
    u[i] = ((6 * slope) / span - sig * u[i - 1]) / p;
  }
  for (let i = n - 2; i >= 0; i--) y2[i] = y2[i] * y2[i + 1] + u[i];
  const out = new Float64Array(256);
  let j = 0;
  for (let x = 0; x < 256; x++) {
    while (j < n - 2 && x > points[j + 1].x) j++;
    const h = points[j + 1].x - points[j].x,
      a = (points[j + 1].x - x) / h,
      b = (x - points[j].x) / h;
    out[x] = clamp(
      (a * points[j].y +
        b * points[j + 1].y +
        (((a * a * a - a) * y2[j] + (b * b * b - b) * y2[j + 1]) * h * h) / 6) /
        255,
    );
  }
  return out;
}
type RGB = [number, number, number];
function hsl(r: number, g: number, b: number, out: RGB): RGB {
  const hi = Math.max(r, g, b),
    lo = Math.min(r, g, b),
    d = hi - lo,
    l = (hi + lo) / 2;
  let h = 0;
  if (d) h = hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  out[0] = h / 6;
  out[1] = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  out[2] = l;
  return out;
}
function fromHsl(h: number, s: number, l: number, out: RGB) {
  h = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h * 6) % 2) - 1)),
    m = l - c / 2;
  const k = Math.floor(h * 6);
  out[0] = (k === 0 || k === 5 ? c : k === 1 || k === 4 ? x : 0) + m;
  out[1] = (k === 1 || k === 2 ? c : k === 0 || k === 3 ? x : 0) + m;
  out[2] = (k === 3 || k === 4 ? c : k === 2 || k === 5 ? x : 0) + m;
}
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function preserveLuma(out: RGB, target: number) {
  const y = luma(...out),
    delta = target - y;
  for (let i = 0; i < 3; i++) out[i] += delta;
  // Compress chroma toward the target gray to stay in gamut while retaining luminance.
  let scale = 1;
  for (const c of out) {
    if (c < 0) scale = Math.min(scale, target / (target - c));
    if (c > 1) scale = Math.min(scale, (1 - target) / (c - target));
  }
  for (let i = 0; i < 3; i++) out[i] = target + (out[i] - target) * scale;
}
const hex = (s: string): RGB => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
];
const linear = (s: number) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
const srgb = (s: number) => (s <= 0.0031308 ? 12.92 * s : 1.055 * s ** (1 / 2.4) - 0.055);
// Compile once per layer, reusing a 256-entry LUT for separable channel operations.
export function compileAdjustment(
  a: Adjustment,
): (r: number, g: number, b: number, out: RGB) => void {
  const v = {
      ...Object.fromEntries(definitions[a.type].controls.map((c) => [c.key, c.initial])),
      ...a.values,
    },
    t = a.type;
  if (['brightness', 'levels', 'curves', 'exposure', 'invert', 'posterize'].includes(t)) {
    const ct =
      t === 'curves'
        ? (Object.fromEntries(
            channels.map((c) => [
              c,
              (a.revision === 2 ? naturalCurveTable : curveTable)(a.curves![c]),
            ]),
          ) as Record<Channel, Float64Array>)
        : null;
    const tables = ['r', 'g', 'b'].map((channel) =>
      Float64Array.from({ length: 256 }, (_, i) => {
        let x = i / 255;
        if (t === 'brightness' && a.revision !== 2) {
          x = v.brightness < 0 ? x * (1 + v.brightness / 100) : x + ((1 - x) * v.brightness) / 100;
          const contrast = v.contrast < 0 ? 1 + v.contrast / 100 : 1 / (1 - v.contrast / 101);
          x = (x - 0.5) * contrast + 0.5;
        }
        if (t === 'brightness' && a.revision === 2) {
          if (v.legacy) {
            x += v.brightness / 255;
            const factor = v.contrast < 0 ? 1 + v.contrast / 100 : 1 / (1 - v.contrast / 100);
            x = (x - 0.5) * factor + 0.5;
          } else {
            x = sampleResponse(toneResponse.brightness, v.brightness, -150, x);
            x = sampleResponse(toneResponse.contrast, v.contrast, -50, x);
          }
        }
        if (t === 'levels')
          for (const c of ['rgb', channel])
            x =
              (v[c + 'OutBlack'] +
                (v[c + 'OutWhite'] - v[c + 'OutBlack']) *
                  clamp((x * 255 - v[c + 'Black']) / (v[c + 'White'] - v[c + 'Black'])) **
                    (1 / v[c + 'Gamma'])) /
              255;
        if (t === 'curves') {
          x = ct![channel as Channel][i];
          const f = clamp(x) * 255,
            lo = Math.floor(f),
            hi = Math.min(255, lo + 1);
          x = ct!.rgb[lo] + (ct!.rgb[hi] - ct!.rgb[lo]) * (f - lo);
        }
        if (t === 'exposure')
          x =
            a.revision === 2
              ? clamp(x ** 2.2 * 2 ** v.ev + v.offset) ** (1 / (2.2 * v.gamma))
              : srgb(clamp(linear(x) * 2 ** v.ev + v.offset) ** (1 / v.gamma));
        if (t === 'invert') x = 1 - x;
        if (t === 'posterize')
          x =
            a.revision === 2
              ? Math.min(v.steps - 1, Math.floor((i * v.steps) / 256)) / (v.steps - 1)
              : Math.round(x * (v.steps - 1)) / (v.steps - 1);
        return clamp(x);
      }),
    );
    return (r, g, b, out) => {
      out[0] = tables[0][r];
      out[1] = tables[1][g];
      out[2] = tables[2][b];
    };
  }
  const colors = a.colors?.map(hex),
    cube = a.cube,
    scratch: RGB = [0, 0, 0],
    weights = new Float64Array(9);
  const xyz = [
      [0.4360747, 0.3850649, 0.1430804],
      [0.2225045, 0.7168786, 0.0606169],
      [0.0139322, 0.0971045, 0.7141733],
    ],
    inv = [
      [3.1338561, -1.6168667, -0.4906146],
      [-0.9787684, 1.9161415, 0.033454],
      [0.0719453, -0.2289914, 1.4052427],
    ];
  const filter = colors?.[0]?.map(linear),
    gain =
      t === 'photo'
        ? xyz.map(
            (row) =>
              1 -
              v.density / 100 +
              ((v.density / 100) * row.reduce((sum, x, i) => sum + x * filter![i], 0)) /
                row.reduce((sum, x) => sum + x, 0),
          )
        : [];
  const photoMatrix =
    t === 'photo'
      ? inv.map((row) =>
          [0, 1, 2].map((c) => row.reduce((sum, x, i) => sum + x * gain[i] * xyz[i][c], 0)),
        )
      : [];
  const stops = (
    a.stops ?? a.colors?.map((color, i) => ({ position: i * 100, color, midpoint: 50 }))
  )?.map((s) => ({ ...s, rgb: hex(s.color) }));
  return (R, G, B, out) => {
    const r = R / 255,
      g = G / 255,
      b = B / 255;
    out[0] = r;
    out[1] = g;
    out[2] = b;
    if (t === 'hsl' || t === 'vibrance') {
      const [h, s, l] = hsl(r, g, b, scratch);
      if (t === 'hsl') {
        let hue = v.hue,
          sat = v.saturation,
          light = v.lightness;
        if (!v.colorize)
          for (const band of a.bands ?? []) {
            const d = Math.abs(((h * 360 - band.center + 540) % 360) - 180),
              w = clamp(1 - (d - band.width / 2) / band.feather);
            hue += band.hue * w;
            sat += band.saturation * w;
            light += band.lightness * w;
          }
        let inputH = h,
          inputS = s,
          inputL = l;
        if (a.revision === 2) {
          const lit = (x: number) =>
            light < 0 ? x * (1 + light / 100) : x + ((1 - x) * light) / 100;
          [inputH, inputS, inputL] = hsl(lit(r), lit(g), lit(b), scratch);
        }
        const ns = v.colorize
            ? v.colorizeSaturation / 100
            : clamp(
                inputS *
                  (a.revision === 2 && sat > 0
                    ? 1 / Math.max(0.0001, 1 - sat / 100)
                    : 1 + sat / 100),
              ),
          nl = light < 0 ? l * (1 + light / 100) : l + ((1 - l) * light) / 100;
        fromHsl(
          v.colorize ? v.colorizeHue / 360 : inputH + hue / 360,
          ns,
          a.revision === 2 ? inputL : clamp(nl),
          out,
        );
      } else if (a.revision === 2 && v.skin) {
        scratch[0] = r;
        scratch[1] = g;
        scratch[2] = b;
        applyVibranceResponse(scratch, v.vibrance, 0, out);
        scratch[0] = out[0];
        scratch[1] = out[1];
        scratch[2] = out[2];
        applyVibranceResponse(scratch, v.saturation, 1, out);
      } else {
        const distance = Math.abs(((h * 360 - 30 + 540) % 360) - 180),
          skin = a.revision === 2 && v.skin ? clamp(1 - distance / 45) * clamp(s * 4) : 0;
        const gain = (v.vibrance / 100) * (1 - s) * (1 - 0.75 * skin);
        fromHsl(h, clamp(s * (1 + gain) * (1 + v.saturation / 100)), l, out);
      }
    }
    if (t === 'balance' && a.revision !== 2) {
      const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2,
        sh = (1 - l) ** 2,
        hi = l * l,
        mid = 2 * l * (1 - l);
      for (let c = 0; c < 3; c++)
        out[c] = clamp(
          out[c] +
            (v['shadows' + 'RGB'[c]] * sh +
              v['midtones' + 'RGB'[c]] * mid +
              v['highlights' + 'RGB'[c]] * hi) /
              100,
        );
      if (v.preserve) preserveLuma(out, luma(r, g, b));
    }
    if (t === 'balance' && a.revision === 2) {
      if (v.preserve) {
        const shMax = Math.max(v.shadowsR, v.shadowsG, v.shadowsB),
          hiMin = Math.min(v.highlightsR, v.highlightsG, v.highlightsB),
          midCenter =
            (Math.max(v.midtonesR, v.midtonesG, v.midtonesB) +
              Math.min(v.midtonesR, v.midtonesG, v.midtonesB)) /
            2;
        for (let c = 0; c < 3; c++) {
          const key = 'RGB'[c],
            black = shMax - v['shadows' + key],
            white = 255 - v['highlights' + key] + hiMin,
            gamma = 2 ** ((v['midtones' + key] - midCenter) / 100);
          out[c] = clamp((out[c] * 255 - black) / Math.max(1, white - black)) ** (1 / gamma);
        }
      } else
        for (let c = 0; c < 3; c++) {
          const key = 'RGB'[c];
          for (let zone = 2; zone >= 0; zone--)
            out[c] = sampleResponse(
              balanceResponse[zone],
              v[['shadows', 'midtones', 'highlights'][zone] + key],
              -100,
              out[c],
            );
        }
    }
    if (t === 'blackwhite') {
      const [h] = hsl(r, g, b, scratch),
        pos = h * 6,
        i = Math.floor(pos) % 6,
        f = pos - Math.floor(pos),
        weight = (v['color' + i] * (1 - f) + v['color' + ((i + 1) % 6)] * f) / 100;
      const gray = clamp(Math.min(r, g, b) + (Math.max(r, g, b) - Math.min(r, g, b)) * weight);
      out.fill(gray);
      if (v.tint) fromHsl(v.tintHue / 360, v.tintSaturation / 100, gray, out);
    }
    if (t === 'photo' && a.revision !== 2) {
      const amount = v.density / 100;
      for (let c = 0; c < 3; c++) out[c] = out[c] * (1 - amount) + colors![0][c] * amount;
      if (v.preserve) preserveLuma(out, luma(r, g, b));
    }
    if (t === 'photo' && a.revision === 2) {
      scratch[0] = linear(r);
      scratch[1] = linear(g);
      scratch[2] = linear(b);
      for (let c = 0; c < 3; c++)
        out[c] = srgb(clamp(photoMatrix[c].reduce((sum, x, i) => sum + x * scratch[i], 0)));
      if (v.preserve) {
        scratch[0] = r;
        scratch[1] = g;
        scratch[2] = b;
        blendRGB(scratch, out, 'color', out);
      }
    }
    if (t === 'mixer') {
      for (let c = 0; c < 3; c++) {
        const key = v.mono ? 'r' : 'rgb'[c];
        out[c] = clamp(
          (r * v[key + 'R'] + g * v[key + 'G'] + b * v[key + 'B'] + v[key + 'Constant']) / 100,
        );
      }
    }
    if (t === 'threshold')
      out.fill(
        (a.revision === 2 ? Math.round(0.3 * R + 0.59 * G + 0.11 * B) : luma(r, g, b) * 255) >=
          v.threshold
          ? 1
          : 0,
      );
    if (t === 'gradient') {
      let y = a.revision === 2 ? 0.3 * r + 0.59 * g + 0.11 * b : luma(r, g, b);
      if (v.reverse) y = 1 - y;
      const p = y * 100;
      let i = 0;
      while (i < stops!.length - 2 && p > stops![i + 1].position) i++;
      const low = stops![i],
        high = stops![i + 1];
      let f = clamp((p - low.position) / (high.position - low.position));
      f = f ** (Math.log(0.5) / Math.log(low.midpoint / 100));
      if (a.revision === 2 && v.smooth) f += ((f * f * (3 - 2 * f) - f) * v.smooth) / 200;
      for (let c = 0; c < 3; c++) out[c] = low.rgb[c] * (1 - f) + high.rgb[c] * f;
    }
    if (t === 'selective') {
      const hi = Math.max(r, g, b),
        lo = Math.min(r, g, b),
        mid = r + g + b - hi - lo;
      weights[0] = r === hi ? hi - mid : 0;
      weights[1] = b === lo ? mid - lo : 0;
      weights[2] = g === hi ? hi - mid : 0;
      weights[3] = r === lo ? mid - lo : 0;
      weights[4] = b === hi ? hi - mid : 0;
      weights[5] = g === lo ? mid - lo : 0;
      weights[6] = clamp((lo - 0.5) * 2);
      weights[7] = 1 - Math.abs(hi + lo - 1);
      weights[8] = clamp((0.5 - hi) * 2);
      const input = scratch;
      input[0] = r;
      input[1] = g;
      input[2] = b;
      for (let c = 0; c < 3; c++) {
        let delta = 0;
        for (let k = 0; k < 9; k++) {
          const ink = v[k + 'CMY'[c]] / 100,
            black = v[k + 'K'] / 100;
          delta +=
            weights[k] *
            (ink * (v.relative ? 1 - input[c] : 1) + black * (v.relative ? input[c] : 1));
        }
        out[c] = clamp(input[c] - delta);
      }
    }
    if (t === 'lookup' && cube) {
      const cr = shaperValue(cube, 0, r),
        cg = shaperValue(cube, 1, g),
        cb = shaperValue(cube, 2, b);
      const size = cube.size,
        rx = clamp((cr - cube.min[0]) / (cube.max[0] - cube.min[0])) * (size - 1),
        gy = clamp((cg - cube.min[1]) / (cube.max[1] - cube.min[1])) * (size - 1),
        bz = clamp((cb - cube.min[2]) / (cube.max[2] - cube.min[2])) * (size - 1),
        lr = Math.floor(rx),
        lg = Math.floor(gy),
        lb = Math.floor(bz),
        fr = rx - lr,
        fg = gy - lg,
        fb = bz - lb;
      out.fill(0);
      if (v.interpolation && a.revision === 2) {
        const fractions = [fr, fg, fb],
          order = [0, 1, 2].sort((x, y) => fractions[y] - fractions[x]),
          point = [lr, lg, lb];
        const at = (k: number) =>
          (Math.min(size - 1, point[0]) +
            Math.min(size - 1, point[1]) * size +
            Math.min(size - 1, point[2]) * size * size) *
            3 +
          k;
        for (let c = 0; c < 3; c++) out[c] = cube.data[at(c)] * (1 - fractions[order[0]]);
        for (let j = 0; j < 3; j++) {
          point[order[j]]++;
          const weight = fractions[order[j]] - (j < 2 ? fractions[order[j + 1]] : 0);
          for (let c = 0; c < 3; c++) out[c] += cube.data[at(c)] * weight;
        }
      } else
        for (let z = 0; z < 2; z++)
          for (let y = 0; y < 2; y++)
            for (let x = 0; x < 2; x++) {
              const idx =
                  (Math.min(size - 1, lr + x) +
                    Math.min(size - 1, lg + y) * size +
                    Math.min(size - 1, lb + z) * size * size) *
                  3,
                w = (x ? fr : 1 - fr) * (y ? fg : 1 - fg) * (z ? fb : 1 - fb);
              for (let c = 0; c < 3; c++) out[c] += cube.data[idx + c] * w;
            }
    }
    for (let c = 0; c < 3; c++) out[c] = clamp(out[c]);
  };
}
export type AdjustmentBlend = BlendMode;
export function adjustPixels(
  data: Uint8ClampedArray,
  a: Adjustment,
  opacity = 1,
  mask?: Uint8ClampedArray,
  blend: AdjustmentBlend = 'normal',
  start = 0,
  end = data.length,
  compiled = compileAdjustment(a),
) {
  const out: RGB = [0, 0, 0],
    beforeRGB: RGB = [0, 0, 0],
    mixed: RGB = [0, 0, 0];
  for (let i = start; i < end; i += 4) {
    if (!data[i + 3]) continue;
    let amount = opacity * (mask ? mask[i + 3] / 255 : 1);
    if (blend === 'dissolve') amount = pixelNoise(i / 4) < amount ? 1 : 0;
    if (!amount) continue;
    compiled(data[i], data[i + 1], data[i + 2], out);
    for (let c = 0; c < 3; c++) beforeRGB[c] = data[i + c] / 255;
    if (a.values.dither && (a.type === 'lookup' || a.type === 'gradient'))
      for (let c = 0; c < 3; c++) out[c] = clamp(out[c] + (pixelNoise(i / 4) - 0.5) / 255);
    blendRGB(beforeRGB, out, blend, mixed);
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.round(clamp(beforeRGB[c] + (mixed[c] - beforeRGB[c]) * amount) * 255);
  }
}
