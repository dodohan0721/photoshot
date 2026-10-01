import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../src/adjustments.ts';
import { parseLut, parseCsp, parse3dl, validateCube } from '../src/lut.ts';
import {
  autoLevels,
  sampleAdjustment,
  parseAcv,
  encodeAcv,
  parseTonePreset,
} from '../src/tone-tools.ts';
import { analyzeTones } from '../src/tone-analysis.ts';
import { blendNames, blendRGB, compositeBlend } from '../src/blend.ts';
import { presetsFor, lookupPreset } from '../src/adjustment-presets.ts';
import * as old from './fixtures/adjustments-v1.ts';
let groups = 0;
const check = (name, fn) => {
  fn();
  groups++;
  console.log('PASS', name);
};
const color = (a, p) => {
  const out = [0, 0, 0];
  A.compileAdjustment(a)(...p, out);
  return out;
};
const near = (a, b, e = 1e-7) =>
  a.forEach((x, i) => assert(Math.abs(x - b[i]) <= e, `${a} != ${b}`));
function cube(n, f = (r, g, b) => [r, g, b]) {
  let s = `LUT_3D_SIZE ${n}\n`;
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) s += f(r / (n - 1), g / (n - 1), b / (n - 1)).join(' ') + '\n';
  return s;
}
const lut = (text, name = 'test.cube') => ({
  ...A.makeAdjustment('lookup'),
  cube: parseLut(text, name),
});
check('old 16-layer projects validate and retain exact pixels', () => {
  for (const t of A.adjustmentTypes) {
    const a = old.makeAdjustment(t);
    if (t === 'brightness') a.values.brightness = 30;
    if (t === 'exposure') a.values.ev = 1;
    if (t === 'photo') a.values.density = 70;
    if (t === 'vibrance') a.values.vibrance = 40;
    A.validateAdjustment(a);
    const x = Uint8ClampedArray.from([15, 100, 210, 90, 128, 128, 128, 255]),
      y = x.slice();
    old.adjustPixels(x, a);
    A.adjustPixels(y, a);
    assert.deepEqual(y, x);
  }
});
check('65-cube supports both interpolation modes and project serialization', () => {
  const a = lut(cube(65));
  for (const interpolation of [0, 1]) {
    a.values.interpolation = interpolation;
    near(color(a, [14, 128, 239]), [14 / 255, 128 / 255, 239 / 255]);
  }
  A.validateAdjustment(JSON.parse(JSON.stringify(a)));
});
check('1D and 1D-plus-3D cubes honor input range and stage order', () => {
  const a = lut('LUT_1D_SIZE 3\nLUT_1D_INPUT_RANGE 0 1\n0 0 0\n0.2 0.5 0.8\n1 1 1\n');
  near(color(a, [127.5, 127.5, 127.5]), [0.2, 0.5, 0.8]);
  const b = lut(
    'LUT_1D_SIZE 2\nLUT_3D_SIZE 2\n0 0 0\n0.5 1 1\n' +
      cube(2, (r, g, b) => [1 - r, g, b])
        .split('\n')
        .slice(1)
        .join('\n'),
  );
  near(color(b, [255, 128, 0]), [0.5, 128 / 255, 0]);
});
check('trilinear and tetrahedral preserve axes with nonlinear table', () => {
  const a = lut(cube(2, (r, g, b) => [r * g, g * b, r * b]));
  a.values.interpolation = 0;
  near(color(a, [51, 102, 153]), [0.08, 0.24, 0.12]);
  a.values.interpolation = 1;
  near(color(a, [51, 102, 153]), [0.2, 0.4, 0.2]);
});
check('3DL blue-fast order and explicit output bit depth', () => {
  let s = '3DMESH\nMesh 1 12\n0 1023\n';
  for (let r = 0; r < 2; r++)
    for (let g = 0; g < 2; g++)
      for (let b = 0; b < 2; b++) s += `${4095 * b} ${4095 * r} ${4095 * g}\n`;
  s += 'LUT8\ngamma 1.0\n';
  near(color(lut(s, 'test.3dl'), [51, 102, 153]), [0.6, 0.2, 0.4]);
});
check('LOOK little-endian float RGB table', () => {
  const bytes = Buffer.alloc(2 ** 3 * 3 * 4);
  let i = 0;
  for (let b = 0; b < 2; b++)
    for (let g = 0; g < 2; g++)
      for (let r = 0; r < 2; r++)
        for (const x of [b, g, r]) {
          bytes.writeFloatLE(x, i);
          i += 4;
        }
  const s = `<look><LUT><size>"2"</size><data>"${bytes.toString('hex')}"</data></LUT></look>`;
  near(color(lut(s, 'test.look'), [51, 102, 153]), [0.6, 0.4, 0.2]);
});
const cspPre = '2\n0 1\n0 1\n'.repeat(3);
check('CSP 3D metadata and channel order', () => {
  const text =
    'CSPLUTV100\n3D\nBEGIN METADATA\nExample\nEND METADATA\n' +
    cspPre +
    '2 2 2\n' +
    cube(2, (r, g, b) => [b, 1 - r, g])
      .split('\n')
      .slice(1)
      .join('\n');
  near(color(lut(text, 'test.csp'), [51, 102, 153]), [0.6, 0.8, 0.4]);
});
check('CSP 1D retains interior output knots when precurve is identity', () => {
  const text = 'CSPLUTV100\n1D\n' + cspPre + '3\n0 0 0\n0.1 0.4 0.9\n1 1 1\n';
  near(color(lut(text, 'one.csp'), [127.5, 127.5, 127.5]), [0.1, 0.4, 0.9]);
});
check(
  'malformed large headers, duplicate domains, XML entities and nonfinite values are rejected',
  () => {
    for (const [name, text] of [
      ['x.cube', 'LUT_3D_SIZE 256\n'],
      ['x.cube', 'DOMAIN_MIN 0 0 0\nDOMAIN_MIN 0 0 0\n' + cube(2)],
      ['x.cube', cube(2).replace('0 0 0', 'NaN 0 0')],
      ['x.look', '<!DOCTYPE x><look/>'],
      ['x.csp', 'CSPLUTV100\n3D\n2\n0 1\n0 1\n'],
    ])
      assert.throws(() => parseLut(text, name));
  },
);
check('levels auto and all three eyedroppers are functional', () => {
  const a = A.makeAdjustment('levels'),
    analysis = analyzeTones(Uint8ClampedArray.from([20, 20, 20, 255, 220, 220, 220, 255]));
  const auto = autoLevels(a, analysis, false, 0);
  near(color(auto, [20, 20, 20]), [0, 0, 0]);
  near(color(auto, [220, 220, 220]), [1, 1, 1]);
  for (const mode of ['black', 'white']) {
    const picked = sampleAdjustment(a, [60, 80, 100], { mode, channel: 'rgb' });
    near(color(picked, [60, 80, 100]), Array(3).fill(mode === 'black' ? 0 : 1));
  }
  const gray = sampleAdjustment(a, [80, 120, 160], { mode: 'gray', channel: 'rgb' });
  near(color(gray, [80, 120, 160]), [0.5, 0.5, 0.5], 0.003);
});
check('ACV roundtrip, truncated input and duplicate x rejection', () => {
  const a = A.makeAdjustment('curves');
  a.curves.r = [
    { x: 0, y: 10 },
    { x: 75, y: 100 },
    { x: 255, y: 240 },
  ];
  assert.deepEqual(parseAcv(encodeAcv(a)).curves, a.curves);
  assert.throws(() => parseAcv(new ArrayBuffer(3)));
  const bad = encodeAcv(a),
    v = new DataView(bad);
  v.setUint16(12, 0, false);
  assert.throws(() => parseAcv(bad));
});
check('HSL targeted color leaves unrelated colors alone and wraps around red', () => {
  const a = A.makeAdjustment('hsl');
  a.bands[0].hue = 90;
  assert.notDeepEqual(color(a, [230, 20, 30]), [230 / 255, 20 / 255, 30 / 255]);
  near(color(a, [20, 30, 230]), [20 / 255, 30 / 255, 230 / 255]);
  const pick = sampleAdjustment(a, [230, 20, 40], { mode: 'target', channel: 'rgb' });
  assert(pick.bands[0].center > 340);
});
check('Colorize colors gray and reset removes targeted edits', () => {
  const a = A.makeAdjustment('hsl');
  Object.assign(a.values, { colorize: 1, colorizeHue: 210, colorizeSaturation: 60 });
  const p = color(a, [128, 128, 128]);
  assert(p[2] > p[0]);
  assert(A.isIdentityAdjustment(A.makeAdjustment('hsl')));
  a.bands[2].saturation = 25;
  assert(!A.isIdentityAdjustment(a));
});
check('black-white tint and targeted brightening survive serialization', () => {
  const a = A.makeAdjustment('blackwhite');
  a.values.tint = 1;
  const p = color(a, [128, 128, 128]);
  assert(p[0] > p[2]);
  const b = sampleAdjustment(a, [255, 0, 0], { mode: 'white', channel: 'rgb' });
  assert.equal(b.values.color0, a.values.color0 + 10);
  A.validateAdjustment(JSON.parse(JSON.stringify(b)));
});
check('gradient interior stops, midpoint, reverse, dither are persisted', () => {
  const a = A.makeAdjustment('gradient');
  a.stops = [
    { position: 0, color: '#000000', midpoint: 25 },
    { position: 50, color: '#ff0000', midpoint: 50 },
    { position: 100, color: '#ffffff', midpoint: 50 },
  ];
  near(color(a, [127.5, 127.5, 127.5]), [1, 0, 0]);
  near(color(a, [31.875, 31.875, 31.875]), [0.5, 0, 0]);
  a.values.reverse = 1;
  near(color(a, [255, 255, 255]), [0, 0, 0]);
  a.values.dither = 1;
  A.validateAdjustment(JSON.parse(JSON.stringify(a)));
});
check('invalid gradient/band data cannot poison project rendering', () => {
  const a = A.makeAdjustment('gradient');
  a.stops = [
    { position: 0, color: '#000000', midpoint: 0 },
    { position: 100, color: '#ffffff', midpoint: 50 },
  ];
  assert.throws(() => A.validateAdjustment(a));
  const h = A.makeAdjustment('hsl');
  h.bands[0].feather = 0;
  assert.throws(() => A.validateAdjustment(h));
});
check('27 blend modes stay in gamut and source-over preserves correct alpha', () => {
  assert.equal(Object.keys(blendNames).length, 27);
  for (const mode of Object.keys(blendNames)) {
    const out = [0, 0, 0];
    blendRGB([0.1, 0.5, 0.9], [0.9, 0.2, 0.5], mode, out);
    assert(out.every((x) => Number.isFinite(x) && x >= 0 && x <= 1));
    const dst = Uint8ClampedArray.from([40, 80, 160, 128]),
      src = Uint8ClampedArray.from([200, 100, 40, 128]);
    compositeBlend(dst, src, 0.5, mode);
    if (mode !== 'dissolve') assert.equal(dst[3], 160);
  }
});
check('dither is deterministic across render chunks and keeps transparent pixels untouched', () => {
  const a = A.makeAdjustment('gradient');
  a.values.dither = 1;
  const x = new Uint8ClampedArray(512),
    y = new Uint8ClampedArray(512);
  for (let i = 0; i < x.length; i += 4) x.set([101, 101, 101, i % 8 === 0 ? 255 : 0], i);
  y.set(x);
  A.adjustPixels(x, a);
  A.adjustPixels(y, a, 1, undefined, 'normal', 0, 256);
  A.adjustPixels(y, a, 1, undefined, 'normal', 256, 512);
  assert.deepEqual(x, y);
});
check('all built-in presets validate; all 16 JSON preset types roundtrip', () => {
  for (const t of A.adjustmentTypes) {
    for (const p of presetsFor(t)) A.validateAdjustment(p.make());
    const a = A.makeAdjustment(t);
    assert.deepEqual(
      parseTonePreset(
        JSON.stringify({ format: 'photoshot-tone-preset', version: 1, adjustment: a }),
        t,
      ),
      a,
    );
  }
  for (const n of ['Neutral', 'Warm Portrait', 'Cool Shadows', 'Soft Film'])
    validateCube(lookupPreset(n));
});
console.log(`PASS ${groups} upgrade test groups`);
