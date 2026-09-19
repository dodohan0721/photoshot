import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
globalThis.document = {
  createElement(name) {
    assert.equal(name, 'canvas');
    return createCanvas(1, 1);
  },
};
const { makeLayer, maskSurface, layerSurface, composite, validateDoc, localPoint } = await import(
  '../src/document.ts'
);
const base = makeLayer({
  width: 100,
  height: 100,
  strokes: [{ points: [{ x: 50, y: 50 }], size: 200, color: '#ff0000', erase: false }],
});
const original = JSON.stringify(base);
const mask = { width: 100, height: 100, enabled: true, inverted: false, strokes: [] };
const alpha = (canvas, x, y) => canvas.getContext('2d').getImageData(x, y, 1, 1).data[3];
const hide = { points: [{ x: 50, y: 50 }], size: 40, color: '#ffffff', erase: true };
let layer = { ...base, mask: { ...mask, strokes: [hide] } };
assert.equal(alpha(await layerSurface(layer), 50, 50), 0);
assert.equal(alpha(await layerSurface(base), 50, 50), 255);
assert.equal(JSON.stringify(base), original);
layer = { ...layer, mask: { ...layer.mask, strokes: [hide, { ...hide, size: 10, erase: false }] } };
assert.equal(alpha(await layerSurface(layer), 50, 50), 255);
assert.equal(alpha(await layerSurface(layer), 65, 50), 0);
assert.equal(
  alpha(await layerSurface({ ...layer, mask: { ...layer.mask, inverted: true } }), 50, 50),
  0,
);
assert.equal(
  alpha(await layerSurface({ ...layer, mask: { ...layer.mask, enabled: false } }), 65, 50),
  255,
);
const scaled = { ...base, width: 200, height: 200, mask: { ...mask, strokes: [hide] } };
assert.equal(alpha(await layerSurface(scaled), 100, 100), 0);
assert.equal(alpha(await layerSurface(scaled), 30, 30), 255);
const selected = {
  ...base,
  mask: {
    ...mask,
    polygon: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 0, y: 100 },
    ],
  },
};
assert.equal(alpha(await layerSurface(selected), 25, 50), 255);
assert.equal(alpha(await layerSurface(selected), 75, 50), 0);
const doc = {
  format: 'layer-studio',
  version: 1,
  name: 'mask',
  width: 100,
  height: 100,
  layers: [layer],
};
const loaded = validateDoc(JSON.parse(JSON.stringify(doc)));
assert.equal(alpha(await composite(loaded), 65, 50), 0);
assert.equal(alpha(await composite(loaded), 50, 50), 255);
assert.throws(() =>
  validateDoc({ ...doc, layers: [{ ...layer, mask: { ...mask, enabled: 'yes' } }] }),
);
console.log(
  'PASS: hide/restore, non-destructive source, invert/disable, resize, selection mask, project roundtrip and PNG compositor',
);
