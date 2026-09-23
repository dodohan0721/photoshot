export type Channel = 'rgb' | 'r' | 'g' | 'b';
export type CurvePoint = { x: number; y: number };
export type AdjustmentType = 'levels' | 'curves' | 'exposure';
export type Adjustment = {
  type: AdjustmentType;
  scope: 'below' | 'clipped';
  values: Record<string, number>;
  curves?: Record<Channel, CurvePoint[]>;
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
export const definitions: Record<
  AdjustmentType,
  { name: string; description: string; controls: Control[] }
> = {
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
};
export const adjustmentTypes = Object.keys(definitions) as AdjustmentType[];
export function makeAdjustment(type: AdjustmentType): Adjustment {
  const a: Adjustment = {
    type,
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
  return a;
}
export function isIdentityAdjustment(a: Adjustment): boolean {
  if (a.type === 'curves') return channels.every((c) => a.curves![c].every((p) => p.x === p.y));
  return definitions[a.type].controls.every((c) => a.values[c.key] === c.initial);
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
  if (
    Object.keys(a.values).length !== specs.length ||
    specs.some(
      (c) =>
        !finite(a.values[c.key], c.min, c.max) ||
        ((c.step ?? 1) === 1 && !Number.isInteger(a.values[c.key])),
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
type RGB = [number, number, number];
const linear = (s: number) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
const srgb = (s: number) => (s <= 0.0031308 ? 12.92 * s : 1.055 * s ** (1 / 2.4) - 0.055);
export function compileAdjustment(
  a: Adjustment,
): (r: number, g: number, b: number, out: RGB) => void {
  const v = a.values,
    t = a.type;
  if (true) {
    const ct =
      t === 'curves'
        ? (Object.fromEntries(channels.map((c) => [c, curveTable(a.curves![c])])) as Record<
            Channel,
            Float64Array
          >)
        : null;
    const tables = ['r', 'g', 'b'].map((channel) =>
      Float64Array.from({ length: 256 }, (_, i) => {
        let x = i / 255;
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
        if (t === 'exposure') x = srgb(clamp(linear(x) * 2 ** v.ev + v.offset) ** (1 / v.gamma));
        return clamp(x);
      }),
    );
    return (r, g, b, out) => {
      out[0] = tables[0][r];
      out[1] = tables[1][g];
      out[2] = tables[2][b];
    };
  }
  throw Error('지원하지 않는 조정입니다.');
}
export type AdjustmentBlend = 'normal' | 'multiply' | 'screen' | 'overlay';
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
  const out: RGB = [0, 0, 0];
  for (let i = start; i < end; i += 4) {
    if (!data[i + 3]) continue;
    const amount = opacity * (mask ? mask[i + 3] / 255 : 1);
    if (!amount) continue;
    compiled(data[i], data[i + 1], data[i + 2], out);
    for (let c = 0; c < 3; c++) {
      const before = data[i + c] / 255;
      let after = out[c];
      if (blend === 'multiply') after *= before;
      else if (blend === 'screen') after = 1 - (1 - before) * (1 - after);
      else if (blend === 'overlay')
        after = before < 0.5 ? 2 * before * after : 1 - 2 * (1 - before) * (1 - after);
      data[i + c] = Math.round(clamp(before + (after - before) * amount) * 255);
    }
    // Keep original alpha; compositing a filtered copy with source-over doubles partial alpha.
  }
}
