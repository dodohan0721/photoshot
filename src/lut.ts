// Validated, browser-only LUT readers. No external resources or executable metadata.
export type Shaper = { input: number[][]; output: number[][] };
export type Cube = {
  size: number;
  name: string;
  min: number[];
  max: number[];
  data: number[];
  shaper?: Shaper;
  only1d?: boolean;
};
export const MAX_LUT_BYTES = 32 * 1024 * 1024;
const MAX_SIZE = 65;
const fail = (message = 'LUT 데이터가 올바르지 않습니다.'): never => {
  throw Error(message);
};
const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function validateCube(c: Cube) {
  if (
    !c ||
    !Number.isInteger(c.size) ||
    c.size < 2 ||
    c.size > MAX_SIZE ||
    typeof c.name !== 'string' ||
    c.name.length > 200 ||
    !Array.isArray(c.min) ||
    !Array.isArray(c.max) ||
    c.min.length !== 3 ||
    c.max.length !== 3 ||
    c.min.some((x, i) => !num(x) || !num(c.max[i]) || x >= c.max[i]) ||
    !Array.isArray(c.data) ||
    c.data.length !== c.size ** 3 * 3 ||
    c.data.some((x) => !num(x) || Math.abs(x) > 65536)
  )
    fail();
  if (c.only1d !== undefined && typeof c.only1d !== 'boolean') fail();
  if (c.shaper) {
    const { input, output } = c.shaper;
    if (
      !Array.isArray(input) ||
      !Array.isArray(output) ||
      input.length !== 3 ||
      output.length !== 3
    )
      fail();
    for (let k = 0; k < 3; k++) {
      const x = input[k],
        y = output[k];
      if (
        !Array.isArray(x) ||
        !Array.isArray(y) ||
        x.length < 2 ||
        x.length > 65536 ||
        x.length !== y.length ||
        x.some((v, i) => !num(v) || (i > 0 && v <= x[i - 1])) ||
        y.some((v) => !num(v) || Math.abs(v) > 65536)
      )
        fail('LUT 입력 곡선이 올바르지 않습니다.');
    }
  }
}
const base = (name: string): Cube => ({
  size: 2,
  name: name.slice(0, 200),
  min: [0, 0, 0],
  max: [1, 1, 1],
  data: [],
});
const identity = () => {
  const d: number[] = [];
  for (let b = 0; b < 2; b++)
    for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) d.push(r, g, b);
  return d;
};
const lines = (text: string) => {
  if (text.length > MAX_LUT_BYTES) fail('LUT 파일은 32MB 이하만 지원합니다.');
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((s) => s.replace(/#.*/, '').trim())
    .filter(Boolean);
};
const numbers = (s: string) => {
  const v = s.split(/\s+/).map(Number);
  if (v.some((x) => !Number.isFinite(x))) fail();
  return v;
};
export function parseCube(text: string, name: string): Cube {
  const c = base(name),
    seen = new Set<string>();
  let one = 0,
    three = 0,
    oneRange = [0, 1],
    threeRange: number[] | null = null;
  const data: number[] = [];
  for (const line of lines(text)) {
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'TITLE') continue;
    if (/^(LUT_(1D|3D)_(SIZE|INPUT_RANGE)|DOMAIN_(MIN|MAX))$/.test(key)) {
      if (seen.has(key)) fail('LUT 헤더가 중복되어 있습니다.');
      seen.add(key);
      const v = numbers(rest.join(' '));
      if (key.endsWith('_SIZE')) {
        const n = v[0],
          limit = key === 'LUT_1D_SIZE' ? 65536 : MAX_SIZE;
        if (v.length !== 1 || !Number.isInteger(n) || n < 2 || n > limit)
          fail(`지원 격자 크기는 3D 2~65, 1D 2~65536입니다.`);
        if (key === 'LUT_1D_SIZE') one = n;
        else three = n;
      } else if (key.startsWith('DOMAIN')) {
        if (v.length !== 3) fail();
        c[key === 'DOMAIN_MIN' ? 'min' : 'max'] = v;
      } else {
        if (v.length !== 2 || v[0] >= v[1]) fail();
        if (key === 'LUT_1D_INPUT_RANGE') oneRange = v;
        else threeRange = v;
      }
    } else {
      const v = numbers(line);
      if (v.length !== 3) fail();
      data.push(...v);
      if (data.length > (MAX_SIZE ** 3 + 65536) * 3) fail('LUT 데이터가 너무 큽니다.');
    }
  }
  if (!one && !three) fail('LUT 크기 정보가 없습니다.');
  if (data.length !== (one + (three ? three ** 3 : 0)) * 3)
    fail('LUT 데이터 개수가 격자 크기와 다릅니다.');
  if (one) {
    if (!seen.has('LUT_1D_INPUT_RANGE') && (seen.has('DOMAIN_MIN') || seen.has('DOMAIN_MAX'))) {
      c.shaper = {
        input: [0, 1, 2].map((k) =>
          Array.from({ length: one }, (_, i) => c.min[k] + (i / (one - 1)) * (c.max[k] - c.min[k])),
        ),
        output: [0, 1, 2].map((k) => Array.from({ length: one }, (_, i) => data[i * 3 + k])),
      };
    } else
      c.shaper = {
        input: [0, 1, 2].map(() =>
          Array.from(
            { length: one },
            (_, i) => oneRange[0] + (i / (one - 1)) * (oneRange[1] - oneRange[0]),
          ),
        ),
        output: [0, 1, 2].map((k) => Array.from({ length: one }, (_, i) => data[i * 3 + k])),
      };
    c.min = [0, 0, 0];
    c.max = [1, 1, 1];
  }
  if (threeRange) {
    if (!one && (seen.has('DOMAIN_MIN') || seen.has('DOMAIN_MAX')))
      fail('DOMAIN과 INPUT_RANGE를 함께 지정할 수 없습니다.');
    c.min = Array(3).fill(threeRange[0]);
    c.max = Array(3).fill(threeRange[1]);
  }
  c.size = three || 2;
  c.data = three ? data.slice(one * 3) : identity();
  if (!three) c.only1d = true;
  validateCube(c);
  return c;
}
export function parse3dl(text: string, name: string): Cube {
  const c = base(name),
    ls = lines(text);
  let bits = 0,
    index = 0;
  while (index < ls.length && !/^[+\-.\d\s]+$/.test(ls[index])) {
    const m = ls[index].match(/^Mesh\s+\d+\s+(\d+)$/i);
    if (m) bits = Number(m[1]);
    index++;
  }
  if (index >= ls.length) fail();
  const grid = numbers(ls[index++]);
  c.size = grid.length;
  if (c.size < 2 || c.size > MAX_SIZE || grid.some((x, i) => x < 0 || (i > 0 && x <= grid[i - 1])))
    fail('3DL 입력 격자가 올바르지 않습니다.');
  const rows: number[][] = [];
  for (; index < ls.length; index++) {
    if (/^(LUT8|gamma)\b/i.test(ls[index])) continue;
    const v = numbers(ls[index]);
    if (v.length !== 3 || v.some((x) => x < 0 || !Number.isInteger(x))) fail();
    rows.push(v);
  }
  if (rows.length !== c.size ** 3) fail('3DL 격자 데이터 개수가 다릅니다.');
  const peak = rows.reduce((m, v) => Math.max(m, ...v), 0);
  if (!bits) bits = [8, 10, 12, 14, 16].find((b) => peak <= 2 ** b - 1) ?? 0;
  if (!bits || bits > 16 || peak > 2 ** bits - 1) fail('3DL 출력 비트 범위가 올바르지 않습니다.');
  c.data = Array(rows.length * 3);
  const n = c.size;
  for (let r = 0; r < n; r++)
    for (let g = 0; g < n; g++)
      for (let b = 0; b < n; b++)
        for (let k = 0; k < 3; k++)
          c.data[(r + n * g + n * n * b) * 3 + k] = rows[(r * n + g) * n + b][k] / (2 ** bits - 1);
  const inputMax = grid.at(-1)!;
  if (grid.some((x, i) => Math.abs(x - (inputMax * i) / (n - 1)) >= 2))
    c.shaper = {
      input: [0, 1, 2].map(() => grid.map((_, i) => i / (n - 1))),
      output: [0, 1, 2].map(() => grid.map((x) => x / inputMax)),
    };
  validateCube(c);
  return c;
}
export function parseLook(text: string, name: string): Cube {
  if (text.length > MAX_LUT_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text))
    fail('지원하지 않는 LOOK 문서입니다.');
  const body =
    text.match(/<LUT\b[^>]*>([\s\S]*?)<\/LUT>/i)?.[1] ??
    fail('색상 표가 포함된 LOOK 파일만 지원합니다.');
  const c = base(name);
  c.size = Number(body.match(/<size>\s*"?(\d+)"?\s*<\/size>/i)?.[1]);
  if (!Number.isInteger(c.size) || c.size < 2 || c.size > MAX_SIZE)
    fail('LOOK 격자 크기는 2~65만 지원합니다.');
  const raw =
    body.match(/<data>\s*"?([\s\S]*?)"?\s*<\/data>/i)?.[1]?.replace(/[\s"]/g, '') ?? fail();
  if (!raw || !/^[\da-f]+$/i.test(raw) || raw.length !== c.size ** 3 * 3 * 8)
    fail('LOOK 색상 표의 길이가 올바르지 않습니다.');
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length; i += 4) c.data.push(view.getFloat32(i, true));
  validateCube(c);
  return c;
}
export function parseCsp(text: string, name: string): Cube {
  const ls = lines(text),
    c = base(name);
  if (ls.shift() !== 'CSPLUTV100') fail('CSP 파일 헤더가 올바르지 않습니다.');
  const dimension = ls.shift();
  if (!['1D', '3D'].includes(dimension!)) fail();
  if (ls[0] === 'BEGIN METADATA') {
    const end = ls.indexOf('END METADATA');
    if (end < 0) fail();
    ls.splice(0, end + 1);
  }
  let i = 0;
  const input: number[][] = [],
    output: number[][] = [];
  for (let k = 0; k < 3; k++) {
    const n = Number(ls[i++]);
    if (!Number.isInteger(n) || n < 2 || n > 65536) fail();
    const x = numbers(ls[i++] ?? ''),
      y = numbers(ls[i++] ?? '');
    if (x.length !== n || y.length !== n) fail();
    input.push(x);
    output.push(y);
  }
  c.shaper = { input, output };
  const dims = numbers(ls[i++] ?? '');
  if (dimension === '3D') {
    if (dims.length !== 3 || dims.some((x) => x !== dims[0]) || dims[0] < 2 || dims[0] > MAX_SIZE)
      fail('동일한 세 축으로 된 2~65 CSP 격자를 지원합니다.');
    c.size = dims[0];
    c.data = ls.slice(i).flatMap((s) => {
      const row = numbers(s);
      if (row.length !== 3) fail();
      return row;
    });
  } else {
    const n = dims[0];
    if (dims.length !== 1 || !Number.isInteger(n) || n < 2 || n > 65536) fail();
    const rows = ls.slice(i).map(numbers);
    if (rows.length !== n || rows.some((v) => v.length !== 3)) fail();
    c.size = 2;
    c.data = identity();
    c.only1d = true;
    const old = c.shaper;
    const combined: Shaper = { input: [], output: [] };
    for (let k = 0; k < 3; k++) {
      const xs = old.input[k],
        ys = old.output[k],
        knots = [...xs];
      for (let j = 0; j < xs.length - 1; j++) {
        if (ys[j] === ys[j + 1]) continue;
        for (
          let v = Math.max(0, Math.ceil(Math.min(ys[j], ys[j + 1]) * (n - 1)));
          v <= Math.min(n - 1, Math.floor(Math.max(ys[j], ys[j + 1]) * (n - 1)));
          v++
        ) {
          if (knots.length > 65536) fail('CSP 입력 곡선이 너무 복잡합니다.');
          const t = (v / (n - 1) - ys[j]) / (ys[j + 1] - ys[j]);
          if (t > 0 && t < 1) knots.push(xs[j] + (xs[j + 1] - xs[j]) * t);
        }
      }
      knots.sort((a, b) => a - b);
      const uniq = knots.filter((x, j) => !j || x > knots[j - 1] + 1e-12);
      if (uniq.length > 65536) fail('CSP 입력 곡선이 너무 복잡합니다.');
      combined.input.push(uniq);
      combined.output.push(
        uniq.map((x) => {
          const y = shaperValue(c, k, x),
            p = clamp(y) * (n - 1),
            lo = Math.floor(p),
            hi = Math.min(n - 1, lo + 1);
          return rows[lo][k] + (rows[hi][k] - rows[lo][k]) * (p - lo);
        }),
      );
    }
    c.shaper = combined;
  }

  validateCube(c);
  return c;
}
export function parseLut(text: string, name: string): Cube {
  const ext = name.split('.').at(-1)?.toLowerCase();
  if (ext === 'cube') return parseCube(text, name);
  if (ext === '3dl') return parse3dl(text, name);
  if (ext === 'look') return parseLook(text, name);
  if (ext === 'csp') return parseCsp(text, name);
  return fail('CUBE, 3DL, LOOK, CSP 파일을 선택하세요.');
}
export function shaperValue(c: Cube, k: number, x: number) {
  if (!c.shaper) return x;
  const a = c.shaper.input[k],
    b = c.shaper.output[k];
  if (x <= a[0]) return b[0];
  if (x >= a.at(-1)!) return b.at(-1)!;
  let lo = 0,
    hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= x) lo = mid;
    else hi = mid;
  }
  return b[lo] + ((b[hi] - b[lo]) * (x - a[lo])) / (a[hi] - a[lo]);
}
