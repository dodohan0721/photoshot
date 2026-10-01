import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parseICC } from '../src/icc.ts';
import { makeAdjustment, compileAdjustment } from '../src/adjustments.ts';
const wasm = fs.readFileSync('src/vendor/lcms/lcms.wasm');
for (const name of ['identity-link', 'invert-link', 'identity-abstract']) {
  const cube = await parseICC(fs.readFileSync('tests/fixtures/icc/' + name + '.icc'), name, wasm);
  const a = makeAdjustment('lookup');
  a.cube = cube;
  const apply = compileAdjustment(a),
    out = [0, 0, 0];
  apply(51, 102, 153, out);
  const expected = name === 'invert-link' ? [0.8, 0.6, 0.4] : [0.2, 0.4, 0.6];
  assert(out.every((v, i) => Math.abs(v - expected[i]) < 0.003));
  console.log(name, out);
}

const malformed = fs.readFileSync('tests/fixtures/icc/identity-link.icc');
malformed.writeUInt32BE(0xffffffff, 136);
await assert.rejects(() => parseICC(malformed, 'invalid', wasm));
console.log('PASS malformed ICC tag bounds rejected');
