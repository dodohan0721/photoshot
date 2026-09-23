import assert from 'node:assert/strict';
import { analyzeTones } from '../src/tone-analysis.ts';
import { gammaPosition, gammaAtPosition, levelsHistogramPath } from '../src/levels-controls.ts';
import { makeAdjustment } from '../src/adjustments.ts';
const red = analyzeTones(new Uint8ClampedArray([255, 0, 0, 255, 20, 40, 60, 0]));
assert.equal(red.count, 1);
assert.equal(red.bins[54], 1);
assert.equal(red.channelBins.r[255], 1);
assert.equal(red.channelBins.g[0], 1);
assert.equal(red.channelBins.b[0], 1);
assert.equal(red.channelBins.rgb[0], 2 / 3);
assert.equal(red.channelBins.rgb[255], 1 / 3);
for (const bins of Object.values(red.channelBins))
  assert(Math.abs(bins.reduce((a, b) => a + b, 0) - 1) < 1e-10);
const partial = analyzeTones(new Uint8ClampedArray([10, 20, 30, 128, 240, 230, 220, 255]));
assert.equal(partial.channelBins.r[10], 128 / 255);
assert.equal(partial.channelBins.r[240], 1);
for (const gamma of [0.1, 0.5, 1, 1.12, 2, 10])
  for (const [black, white] of [
    [0, 255],
    [18, 218],
    [127, 128],
  ]) {
    const pos = gammaPosition(black, white, gamma);
    assert(pos > black && pos < white);
    assert.equal(gammaAtPosition(black, white, pos), gamma);
    // The marker represents the input that maps to exactly mid-gray in the existing engine.
    const a = makeAdjustment('levels');
    Object.assign(a.values, { rgbBlack: black, rgbWhite: white, rgbGamma: gamma });
    const normalized = Math.pow((pos - black) / (white - black), 1 / gamma);
    assert(Math.abs(normalized - 0.5) < 1e-10);
  }
assert.equal(gammaPosition(0, 255, 1), 127.5);
assert.equal(gammaAtPosition(0, 255, -10), 10);
assert.equal(gammaAtPosition(0, 255, 300), 0.1);
assert.equal(levelsHistogramPath(Array(256).fill(0)), '');
const extreme = Array(256).fill(0);
extreme[255] = 100;
assert(levelsHistogramPath(extreme).includes('L 255 4 L 256 4'));
assert(!levelsHistogramPath(extreme, true).includes('NaN'));
console.log(
  'PASS channel vs luminance histograms, transparency weights, gamma marker mapping, endpoint spike and empty data',
);
