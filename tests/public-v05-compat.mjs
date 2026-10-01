import assert from 'node:assert/strict';
import * as previous from './fixtures/v05/adjustments.ts';
import * as current from '../src/adjustments.ts';
const samples = Uint8ClampedArray.from([
  15, 100, 210, 90, 128, 128, 128, 255, 220, 150, 90, 255, 0, 0, 0, 0,
]);
for (const type of previous.adjustmentTypes) {
  const a = previous.makeAdjustment(type);
  if (type === 'levels') Object.assign(a.values, { rgbBlack: 18, rgbWhite: 220, rgbGamma: 1.12 });
  if (type === 'curves')
    a.curves.rgb = [
      { x: 0, y: 0 },
      { x: 64, y: 45 },
      { x: 128, y: 170 },
      { x: 255, y: 255 },
    ];
  if (type === 'exposure') Object.assign(a.values, { ev: 0.7, offset: -0.008, gamma: 1.05 });
  if (type === 'vibrance') Object.assign(a.values, { vibrance: 60, saturation: 10 });
  current.validateAdjustment(a);
  const oldPixels = samples.slice(),
    newPixels = samples.slice();
  previous.adjustPixels(oldPixels, a);
  current.adjustPixels(newPixels, a);
  assert.deepEqual(newPixels, oldPixels, `${type}: previously published project preserves pixels`);
}
console.log('PASS v0.5.0 projects retain exact adjustment pixels');
