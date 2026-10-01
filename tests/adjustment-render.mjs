import assert from 'node:assert/strict';
import { createCanvas, Image } from '@napi-rs/canvas';
globalThis.document = {
  createElement(name) {
    assert.equal(name, 'canvas');
    return createCanvas(1, 1);
  },
};
globalThis.Image = Image;
const A = await import('../src/adjustments.ts');
const { makeLayer, composite, validateDoc } = await import('../src/document.ts');
const pixel = (canvas, x = 5, y = 5) =>
  Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
const close = (actual, expected, tolerance = 1) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) =>
    assert(Math.abs(v - expected[i]) <= tolerance, `${actual} != ${expected}`),
  );
};
const run = (type, values = {}, input = [80, 140, 210, 127]) => {
  const a = A.makeAdjustment(type);
  Object.assign(a.values, values);
  const data = Uint8ClampedArray.from(input);
  A.adjustPixels(data, a);
  return Array.from(data);
};
let tests = 0;
function check(name, fn) {
  fn();
  tests++;
  console.log('PASS', name);
}
check('all 16 default configurations validate', () => {
  assert.equal(A.adjustmentTypes.length, 16);
  for (const type of A.adjustmentTypes) A.validateAdjustment(A.makeAdjustment(type));
});
check('neutral adjustments are identity and preserve alpha', () => {
  for (const type of [
    'brightness',
    'levels',
    'curves',
    'exposure',
    'vibrance',
    'hsl',
    'balance',
    'mixer',
    'lookup',
    'selective',
  ])
    close(run(type), [80, 140, 210, 127], 0);
});
check('brightness extended range and legacy contrast boundary', () => {
  const lo = run('brightness', { brightness: -150 }),
    hi = run('brightness', { brightness: 150 });
  assert(lo[0] < 80 && hi[0] > 80);
  close(run('brightness', { contrast: -100, legacy: 1 }), [128, 128, 128, 127]);
});
check('levels input, gamma, output and individual channels', () => {
  close(run('levels', { rgbBlack: 50, rgbWhite: 200 }, [50, 125, 200, 255]), [0, 128, 255, 255]);
  const p = run('levels', { rGamma: 2 });
  assert(p[0] > 80);
  assert.equal(p[1], 140);
  assert.equal(p[2], 210);
});
check('curves invert and monotonic interpolation', () => {
  const a = A.makeAdjustment('curves');
  a.curves.rgb = [
    { x: 0, y: 255 },
    { x: 255, y: 0 },
  ];
  const b = Uint8ClampedArray.from([80, 140, 210, 127]);
  A.adjustPixels(b, a);
  close(Array.from(b), [175, 115, 45, 127]);
  const table = A.curveTable([
    { x: 0, y: 0 },
    { x: 64, y: 20 },
    { x: 128, y: 230 },
    { x: 255, y: 255 },
  ]);
  assert(table.every((v, i) => v >= 0 && v <= 1 && (!i || v >= table[i - 1])));
});
check('exposure is linear-light EV (not encoded RGB multiplication)', () => {
  close(run('exposure', { ev: 1 }, [128, 128, 128, 255]), [175, 175, 175, 255]);
});
check('HSL hue rotation and desaturation', () => {
  close(run('hsl', { hue: 120 }, [255, 0, 0, 255]), [0, 255, 0, 255]);
  const p = run('hsl', { saturation: -100 });
  assert.equal(p[0], p[1]);
  assert.equal(p[1], p[2]);
});
check('vibrance protects saturated colors', () => {
  close(run('vibrance', { vibrance: 100 }, [255, 0, 0, 128]), [255, 0, 0, 128]);
  assert.notDeepEqual(run('vibrance', { vibrance: 100 }), run('vibrance'));
});
check('balance and photo preserve perceived luminance', () => {
  for (const type of ['balance', 'photo']) {
    const a = A.makeAdjustment(type);
    delete a.revision;
    if (type === 'balance') a.values.midtonesR = 80;
    const p = Uint8ClampedArray.from([80, 140, 210, 128]);
    A.adjustPixels(p, a);
    assert(
      Math.abs(
        0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] - (0.2126 * 80 + 0.7152 * 140 + 0.0722 * 210),
      ) < 1,
    );
    assert.equal(p[3], 128);
  }
});
check('black-white color sliders and grayscale neutrality', () => {
  close(run('blackwhite', {}, [128, 128, 128, 64]), [128, 128, 128, 64]);
  close(run('blackwhite', { color0: 100 }, [255, 0, 0, 255]), [255, 255, 255, 255]);
});
check('channel mixer output independence', () => {
  close(run('mixer', { rR: 0, rB: 100 }, [20, 80, 240, 127]), [240, 80, 240, 127]);
});
check('invert, posterize, threshold and two-color mapping', () => {
  close(run('invert'), [175, 115, 45, 127]);
  close(run('posterize', { steps: 2 }, [64, 150, 220, 127]), [0, 255, 255, 127]);
  close(run('threshold', { threshold: 128 }, [20, 20, 20, 33]), [0, 0, 0, 33]);
  const a = A.makeAdjustment('gradient');
  a.colors = ['#ff0000', '#0000ff'];
  const p = Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 128]);
  A.adjustPixels(p, a);
  close(Array.from(p), [255, 0, 0, 255, 0, 0, 255, 128]);
});
check('selective color targets one color family', () => {
  const a = A.makeAdjustment('selective');
  a.values['0M'] = 100;
  const p = Uint8ClampedArray.from([220, 90, 90, 255, 90, 220, 90, 255]);
  A.adjustPixels(p, a);
  assert(p[1] < 90);
  close(Array.from(p.slice(4)), [90, 220, 90, 255]);
});
let cube = 'TITLE "Identity"\nLUT_3D_SIZE 2\n';
for (let b = 0; b < 2; b++)
  for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) cube += `${r} ${g} ${b}\n`;
check('3D cube axis order, interpolation and roundtrip', () => {
  const a = A.makeAdjustment('lookup');
  a.values.interpolation = 0;
  a.cube = A.parseCube(cube, 'identity.cube');
  A.validateAdjustment(JSON.parse(JSON.stringify(a)));
  const p = Uint8ClampedArray.from([40, 140, 220, 127]);
  A.adjustPixels(p, a);
  close(Array.from(p), [40, 140, 220, 127]);
  a.cube.data = a.cube.data.map((v, i) => (i % 3 === 0 ? 1 - v : v));
  A.adjustPixels(p, a);
  close(Array.from(p), [215, 140, 220, 127]);
});
check('opacity, soft mask and blend modes never change alpha', () => {
  const a = A.makeAdjustment('invert');
  for (const blend of ['normal', 'multiply', 'screen', 'overlay']) {
    const p = Uint8ClampedArray.from([64, 128, 192, 80]);
    A.adjustPixels(p, a, 0.5, Uint8ClampedArray.from([0, 0, 0, 128]), blend);
    assert.equal(p[3], 80);
  }
  const p = Uint8ClampedArray.from([64, 128, 192, 80]);
  A.adjustPixels(p, a, 1, Uint8ClampedArray.from([0, 0, 0, 0]));
  close(Array.from(p), [64, 128, 192, 80], 0);
});
check('malformed curve, numeric parameters and LUTs are rejected', () => {
  for (const text of [
    'LUT_3D_SIZE 2\n0 0 0',
    'LUT_3D_SIZE 64\n',
    'LUT_1D_SIZE 2\n',
    'LUT_3D_SIZE 2\nNaN 0 0',
  ])
    assert.throws(() => A.parseCube(text, 'bad.cube'));
  const a = A.makeAdjustment('levels');
  a.values.rgbBlack = 255;
  assert.throws(() => A.validateAdjustment(a));
  const c = A.makeAdjustment('curves');
  c.curves.r = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 255, y: 255 },
  ];
  assert.throws(() => A.validateAdjustment(c));
});
const paint = (name, color, part = {}) =>
  makeLayer({
    name,
    width: 20,
    height: 20,
    strokes: [{ points: [{ x: 10, y: 10 }], size: 60, color, erase: false }],
    ...part,
  });
const adj = (type, part = {}) =>
  makeLayer({
    kind: 'adjustment',
    width: 20,
    height: 20,
    adjustment: A.makeAdjustment(type),
    ...part,
  });
const doc = (layers) => ({
  format: 'layer-studio',
  version: 2,
  name: 'Adjustment test',
  width: 20,
  height: 20,
  layers,
});
const red = paint('red', '#ff0000'),
  blue = paint('blue', '#0000ff', { width: 10 });
const invert = adj('invert');
close(pixel(await composite(doc([red, invert]))), [0, 255, 255, 255]);
close(pixel(await composite(doc([red, invert, blue]))), [0, 0, 255, 255]);
close(pixel(await composite(doc([red, blue, invert]))), [255, 255, 0, 255]);
tests++;
console.log('PASS stack order and layers above adjustments');
const mask = {
  width: 20,
  height: 20,
  enabled: true,
  inverted: false,
  strokes: [],
  polygon: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ],
};
let image = await composite(doc([red, { ...invert, mask }]));
close(pixel(image, 5), [0, 255, 255, 255]);
close(pixel(image, 15), [255, 0, 0, 255]);
image = await composite(doc([red, { ...invert, mask: { ...mask, inverted: true } }]));
close(pixel(image, 5), [255, 0, 0, 255]);
close(pixel(image, 15), [0, 255, 255, 255]);
close(
  pixel(await composite(doc([red, { ...invert, mask: { ...mask, enabled: false } }])), 15),
  [0, 255, 255, 255],
);
tests++;
console.log('PASS adjustment masks, invert and disable');
const clipped = { ...invert, adjustment: { ...invert.adjustment, scope: 'clipped' } };
image = await composite(doc([red, blue, clipped]));
close(pixel(image, 5), [255, 255, 0, 255]);
close(pixel(image, 15), [255, 0, 0, 255]);
close(pixel(await composite(doc([red, { ...blue, visible: false }, clipped]))), [255, 0, 0, 255]);
close(
  pixel(await composite(doc([red, blue, clipped, { ...clipped, id: 'clip2' }]))),
  [0, 0, 255, 255],
);
close(pixel(await composite(doc([clipped]))), [0, 0, 0, 0]);
tests++;
console.log('PASS clip isolation, clip chains, hidden base and orphan');
image = await composite(doc([paint('half', '#ff0000', { opacity: 0.5 }), invert]));
close(pixel(image), [0, 255, 255, 128]);
close(pixel(await composite(doc([invert]), true)), [255, 255, 255, 255]);
tests++;
console.log('PASS alpha preservation and JPEG paper after adjustments');
const source = JSON.stringify(red),
  project = doc([red, { ...invert, mask }]);
const roundtrip = validateDoc(JSON.parse(JSON.stringify(project)));
assert.deepEqual(pixel(await composite(project)), pixel(await composite(roundtrip)));
assert.equal(JSON.stringify(red), source);
assert.equal(validateDoc({ ...doc([red]), version: 1 }).version, 1);
assert.throws(() => validateDoc({ ...project, version: 1 }));
tests++;
console.log('PASS v1/v2 project compatibility and source immutability');
const preview = await composite(project, false, { maxEdge: 10 });
assert.equal(preview.width, 10);
close(pixel(preview, 2, 2), [0, 255, 255, 255]);
close(pixel(preview, 8, 2), [255, 0, 0, 255]);
await assert.rejects(() => composite(project, false, { cancelled: () => true }), {
  name: 'AbortError',
});
tests++;
console.log('PASS preview coordinates and stale-render cancellation');
console.log(`PASS ${tests} adjustment test groups`);
