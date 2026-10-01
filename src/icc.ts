import instantiate from './vendor/lcms/lcms.js';
import { MAX_LUT_BYTES, validateCube, type Cube } from './lut.ts';
// ICC v2/v4 transformations use LittleCMS 2.16. Browser working space is sRGB.
const RGB = 4 | (3 << 3) | (4 << 16) | (1 << 22),
  LAB = 4 | (3 << 3) | (10 << 16) | (1 << 22),
  XYZ = 4 | (3 << 3) | (9 << 16) | (1 << 22);
let engine: Promise<any> | undefined;
export async function parseICC(
  bytes: Uint8Array,
  name: string,
  wasmBinary?: Uint8Array,
): Promise<Cube> {
  if (bytes.length < 132 || bytes.length > MAX_LUT_BYTES)
    throw Error('ICC 파일 크기가 올바르지 않습니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    str = (n: number) => String.fromCharCode(...bytes.subarray(n, n + 4));
  const length = view.getUint32(0),
    kind = str(12),
    input = str(16),
    output = str(20),
    tags = view.getUint32(128);
  if (str(36) !== 'acsp' || length !== bytes.length || tags > 4096 || 132 + tags * 12 > length)
    throw Error('ICC 헤더가 올바르지 않습니다.');
  for (let i = 0; i < tags; i++) {
    const offset = view.getUint32(136 + i * 12),
      size = view.getUint32(140 + i * 12);
    if (offset < 128 || size > length || offset > length - size)
      throw Error('ICC 태그 범위가 올바르지 않습니다.');
  }
  if (kind !== 'abst' && kind !== 'link')
    throw Error('컬러 룩업에는 Abstract 또는 Device Link ICC 프로파일을 선택해 주세요.');
  if (kind === 'link' && (input !== 'RGB ' || output !== 'RGB '))
    throw Error('현재 RGB → RGB Device Link만 지원합니다.');
  if (kind === 'abst' && (!['Lab ', 'XYZ '].includes(input) || !['Lab ', 'XYZ '].includes(output)))
    throw Error('Lab/XYZ Abstract 프로파일만 지원합니다.');
  engine ??= instantiate(
    wasmBinary
      ? { wasmBinary }
      : { locateFile: () => new URL('./vendor/lcms/lcms.wasm', import.meta.url).href },
  ).catch((e: unknown) => {
    engine = undefined;
    throw e;
  });
  const m = await engine,
    profiles: number[] = [],
    transforms: number[] = [];
  const profile = (p: number) => {
    if (!p) throw Error('ICC 색상 프로파일을 열 수 없습니다.');
    profiles.push(p);
    return p;
  };
  const transform = (a: number, fmtA: number, b: number, fmtB: number) => {
    const t = m.cmsCreateTransform(a, fmtA, b, fmtB, 1, 0);
    if (!t) throw Error('이 ICC 프로파일의 변환을 지원하지 않습니다.');
    transforms.push(t);
  };
  try {
    const p = profile(m.cmsOpenProfileFromMem(bytes, bytes.length));
    if (kind === 'link') transform(p, RGB, 0, RGB);
    else {
      const srgb = profile(m.cmsCreate_sRGBProfile()),
        first = profile(input === 'Lab ' ? m.cmsCreateLab4Profile() : m.cmsCreateXYZProfile()),
        last = profile(output === 'Lab ' ? m.cmsCreateLab4Profile() : m.cmsCreateXYZProfile());
      transform(srgb, RGB, first, input === 'Lab ' ? LAB : XYZ);
      transform(p, input === 'Lab ' ? LAB : XYZ, 0, output === 'Lab ' ? LAB : XYZ);
      transform(last, output === 'Lab ' ? LAB : XYZ, srgb, RGB);
    }
    const size = 65,
      total = size ** 3,
      data: number[] = [];
    for (let start = 0; start < total; start += 4096) {
      const count = Math.min(4096, total - start);
      let values = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const index = start + i;
        values[i * 3] = (index % size) / (size - 1);
        values[i * 3 + 1] = (Math.floor(index / size) % size) / (size - 1);
        values[i * 3 + 2] = Math.floor(index / (size * size)) / (size - 1);
      }
      for (const t of transforms) values = m.cmsDoTransform(t, values, count);
      for (const value of values) {
        if (!Number.isFinite(value)) throw Error('ICC 변환에 유효하지 않은 색상 값이 있습니다.');
        data.push(Math.max(0, Math.min(1, value)));
      }
    }
    const cube: Cube = {
      name: name + ' / ' + (kind === 'abst' ? 'Abstract' : 'Device Link'),
      size,
      min: [0, 0, 0],
      max: [1, 1, 1],
      data,
    };
    validateCube(cube);
    return cube;
  } finally {
    for (const t of transforms) m.cmsDeleteTransform(t);
    for (const p of profiles) m.cmsCloseProfile(p);
  }
}
