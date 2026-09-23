import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import {
  adjustmentTypes,
  makeAdjustment,
  adjustPixels,
  validateAdjustment,
} from '../src/adjustments.ts';
globalThis.document = { createElement: () => createCanvas(1, 1) };
const { makeLayer, composite, validateDoc } = await import('../src/document.ts');
for (const type of adjustmentTypes) {
  const a = makeAdjustment(type),
    pixels = new Uint8ClampedArray([64, 128, 192, 128, 0, 255, 50, 0]);
  const before = pixels.slice();
  adjustPixels(pixels, a);
  assert.deepEqual(pixels, before, `${type} identity and alpha`);
  const base = makeLayer({
    width: 8,
    height: 8,
    strokes: [{ points: [{ x: 4, y: 4 }], size: 20, color: '#4080c0', erase: false }],
  });
  const layer = makeLayer({ kind: 'adjustment', width: 8, height: 8, adjustment: a });
  const doc = {
    format: 'layer-studio',
    version: 2,
    name: 'test',
    width: 8,
    height: 8,
    layers: [base, layer],
  };
  assert.deepEqual(validateDoc(JSON.parse(JSON.stringify(doc))).layers[1].adjustment, a);
  if (type === 'levels') Object.assign(a.values, { rgbBlack: 18, rgbGamma: 1.12, rgbWhite: 218 });
  if (type === 'curves')
    a.curves.rgb = [
      { x: 0, y: 0 },
      { x: 64, y: 46 },
      { x: 128, y: 166 },
      { x: 192, y: 210 },
      { x: 255, y: 255 },
    ];
  if (type === 'exposure') Object.assign(a.values, { ev: 0.7, offset: -0.008, gamma: 1.05 });
  const plain = await composite({ ...doc, layers: [base] }, false),
    out = await composite(doc, false);
  const expected = plain.getContext('2d').getImageData(0, 0, 8, 8).data;
  adjustPixels(expected, a);
  assert.deepEqual(
    out.getContext('2d').getImageData(0, 0, 8, 8).data,
    expected,
    `${type} compositor matches pixel engine`,
  );
  layer.visible = false;
  assert.deepEqual(
    (await composite(doc, false)).getContext('2d').getImageData(0, 0, 8, 8).data,
    plain.getContext('2d').getImageData(0, 0, 8, 8).data,
  );
  layer.visible = true;
  layer.adjustment.scope = 'clipped';
  await composite(doc, false);
  assert.throws(() => validateAdjustment({ ...a, values: { ...a.values, invalid: 1 } }));
}
assert.throws(() => validateAdjustment({ type: 'lookup', scope: 'below', values: {} }));
const invalid = makeAdjustment('levels');
invalid.values.rgbBlack = invalid.values.rgbWhite;
assert.throws(() => validateAdjustment(invalid));
console.log(
  'PASS identity, alpha, project roundtrip, compositor parity, visibility, clipping and validation:',
  adjustmentTypes.join(', '),
);
