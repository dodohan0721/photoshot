import assert from 'node:assert/strict';
import { makeAdjustment, validateAdjustment, adjustPixels } from '../src/adjustments.ts';
import { analyzeTones } from '../src/tone-analysis.ts';
import {
  autoCurves,
  sampleAdjustment,
  parseTonePreset,
  insertCurvePoint,
} from '../src/tone-tools.ts';
const render = (a, p) => {
  const data = Uint8ClampedArray.from([...p, 255]);
  adjustPixels(data, a);
  return [...data].slice(0, 3);
};
let c = makeAdjustment('curves');
for (const mode of ['black', 'white']) {
  const a = sampleAdjustment(c, [40, 70, 100], { mode, channel: 'rgb' });
  validateAdjustment(a);
  assert.deepEqual(render(a, [40, 70, 100]), mode === 'black' ? [0, 0, 0] : [255, 255, 255]);
}
const gray = sampleAdjustment(c, [80, 120, 160], { mode: 'gray', channel: 'rgb' });
assert.equal(new Set(render(gray, [80, 120, 160])).size, 1);
const target = sampleAdjustment(c, [80, 120, 160], { mode: 'target', channel: 'r' });
assert(target.curves.r.some((p) => p.x === 80 && p.y === 80));
assert.deepEqual(render(target, [80, 120, 160]), [80, 120, 160]);
const a = autoCurves(
  c,
  analyzeTones(Uint8ClampedArray.from([30, 30, 30, 255, 200, 200, 200, 255])),
  false,
  0,
);
assert.deepEqual(render(a, [30, 30, 30]), [0, 0, 0]);
assert.deepEqual(render(a, [200, 200, 200]), [255, 255, 255]);
c.curves.rgb = Array.from({ length: 256 }, (_, x) => ({ x, y: 255 - x }));
validateAdjustment(c);
assert.deepEqual(render(c, [30, 90, 200]), [225, 165, 55]);
assert.deepEqual(
  parseTonePreset(
    JSON.stringify({ format: 'photoshot-tone-preset', version: 1, adjustment: c }),
    'curves',
  ),
  c,
);
assert.throws(() =>
  parseTonePreset(
    JSON.stringify({ format: 'photoshot-tone-preset', version: 1, adjustment: c }),
    'exposure',
  ),
);
const exposure = makeAdjustment('exposure');
for (const mode of ['black', 'gray', 'white']) {
  const a = sampleAdjustment(exposure, [128, 128, 128], { mode, channel: 'rgb' });
  validateAdjustment(a);
  const expected = mode === 'black' ? 0 : mode === 'white' ? 255 : 128;
  assert(render(a, [128, 128, 128]).every((v) => Math.abs(v - expected) <= 1));
}
assert.throws(() => sampleAdjustment(exposure, [0, 0, 0], { mode: 'white', channel: 'rgb' }));
const original = makeAdjustment('curves');
insertCurvePoint(original.curves.rgb, 128, 160);
assert.equal(original.curves.rgb.length, 2);
console.log(
  'PASS: sampled black/gray/white points, targeted channel, auto percentiles, 256-point persistence, invalid presets, exposure luminance sampling and immutable edits',
);
