import assert from 'node:assert/strict';
import {
  makeAdjustment,
  adjustPixels,
  isIdentityAdjustment,
  validateAdjustment,
} from '../src/adjustments.ts';
const pixels = new Uint8ClampedArray([
  170, 130, 110, 255, 40, 85, 155, 128, 110, 115, 120, 255, 80, 80, 80, 255, 0, 0, 0, 255, 255, 255,
  255, 255,
]);
const a = makeAdjustment('vibrance');
assert.equal(a.revision, 2);
assert.equal(a.values.skin, 1);
for (const skin of [0, 1]) {
  a.values.skin = skin;
  assert.ok(isIdentityAdjustment(a));
  const x = pixels.slice();
  adjustPixels(x, a);
  assert.deepEqual(x, pixels);
}
Object.assign(a.values, { vibrance: 60, saturation: 10, skin: 1 });
const protectedPixels = pixels.slice();
adjustPixels(protectedPixels, a);
assert.notDeepEqual(protectedPixels, pixels);
for (let i = 3; i < pixels.length; i += 4) assert.equal(protectedPixels[i], pixels[i]);
const off = pixels.slice();
a.values.skin = 0;
adjustPixels(off, a);
assert.notDeepEqual(off, protectedPixels);
for (const skin of [0, 1])
  for (const vibrance of [-100, 0, 100])
    for (const saturation of [-100, 0, 100]) {
      Object.assign(a.values, { skin, vibrance, saturation });
      validateAdjustment(a);
      const x = pixels.slice();
      adjustPixels(x, a);
      for (let i = 3; i < x.length; i += 4) assert.equal(x[i], pixels[i]);
    }
a.values.vibrance = 101;
assert.throws(() => validateAdjustment(a));
a.values.vibrance = 0;
a.revision = 3;
assert.throws(() => validateAdjustment(a));
console.log(
  'PASS vibrance identity with both skin modes, visible color response, alpha, extremes and validation',
);
