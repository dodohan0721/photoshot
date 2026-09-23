import {
  curveTable,
  makeAdjustment,
  validateAdjustment,
  type Adjustment,
  type Channel,
  type CurvePoint,
} from './adjustments.ts';
import type { ToneAnalysis } from './tone-analysis';
export type TonePicker = 'black' | 'gray' | 'white' | 'target';
export type TonePickRequest = { mode: TonePicker; channel: Channel };
const clamp = (n: number, a = 0, b = 255) => Math.max(a, Math.min(b, n));
const linear = (s: number) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
export function insertCurvePoint(points: CurvePoint[], x: number, y: number): CurvePoint[] {
  x = Math.round(clamp(x));
  y = Math.round(clamp(y));
  const all = points.filter((p) => Math.abs(p.x - x) > 1);
  if (x !== 0 && !all.some((p) => p.x === 0)) all.unshift({ x: 0, y: points[0].y });
  if (x !== 255 && !all.some((p) => p.x === 255)) all.push({ x: 255, y: points.at(-1)!.y });
  if (all.length >= 256) throw Error('제어점 수가 너무 많습니다.');
  return [...all, { x, y }].sort((a, b) => a.x - b.x);
}
export function sampleAdjustment(
  a: Adjustment,
  rgb: number[],
  request: TonePickRequest,
): Adjustment {
  const { mode, channel } = request;
  if (a.type === 'curves') {
    const curves = structuredClone(a.curves!);
    if (mode === 'target') {
      const x = Math.round(
        channel === 'rgb'
          ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
          : rgb[['r', 'g', 'b'].indexOf(channel)],
      );
      curves[channel] = insertCurvePoint(curves[channel], x, curveTable(curves[channel])[x] * 255);
    } else if (mode === 'gray') {
      const target = Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
      if (rgb.some((x) => x < 2 || x > 253)) throw Error('중간 밝기의 회색 영역을 선택해 주세요.');
      ['r', 'g', 'b'].forEach((c, i) => {
        curves[c as Channel] = insertCurvePoint(curves[c as Channel], rgb[i], target);
      });
    } else {
      const targets = channel === 'rgb' ? (['r', 'g', 'b'] as const) : [channel];
      targets.forEach((c) => {
        const i = ['r', 'g', 'b'].indexOf(c);
        const x = rgb[i];
        curves[c] = insertCurvePoint(curves[c], x, mode === 'black' ? 0 : 255);
      });
    }
    return { ...a, curves };
  }
  const y =
    0.2126 * linear(rgb[0] / 255) + 0.7152 * linear(rgb[1] / 255) + 0.0722 * linear(rgb[2] / 255);
  const values = { ...a.values };
  if (mode === 'black') values.offset = clamp(-y * 2 ** values.ev, -0.5, 0.5);
  else {
    if (y < 1e-6) throw Error('완전한 검정 대신 밝기가 있는 부분을 선택해 주세요.');
    const target = mode === 'white' ? 1 : linear(128 / 255);
    const raw = (target ** values.gamma - values.offset) / y;
    if (raw <= 0) throw Error('오프셋을 초기화한 뒤 다시 선택해 주세요.');
    values.ev = clamp(Math.log2(raw), -20, 20);
  }
  values.ev = Math.round(values.ev * 100) / 100;
  values.offset = Math.round(values.offset * 10000) / 10000;
  return { ...a, values };
}
export function autoCurves(
  a: Adjustment,
  analysis: ToneAnalysis,
  perChannel = false,
  clip = 0.005,
): Adjustment {
  const curves = structuredClone(makeAdjustment('curves').curves!);
  for (const channel of (perChannel ? ['r', 'g', 'b'] : ['rgb']) as Channel[]) {
    const bins = analysis.channelBins[channel],
      total = bins.reduce((a, b) => a + b, 0);
    if (!total) continue;
    const q = (p: number) => {
      let sum = 0;
      for (let i = 0; i < 256; i++) {
        sum += bins[i];
        if (sum > total * p || (p === 1 && sum === total && bins[i] > 0)) return i;
      }
      return 255;
    };
    const low = q(clip),
      high = q(1 - clip);
    if (high - low < 8) continue;
    curves[channel] = [
      { x: 0, y: 0 },
      ...(low > 0 ? [{ x: low, y: 0 }] : []),
      ...(high < 255 ? [{ x: high, y: 255 }] : []),
      { x: 255, y: 255 },
    ];
  }
  return { ...a, curves };
}
export function parseTonePreset(text: string, type: Adjustment['type']): Adjustment {
  const data = JSON.parse(text);
  if (data.format !== 'photoshot-tone-preset' || data.version !== 1)
    throw Error('Photoshot 사전 설정 파일이 아닙니다.');
  validateAdjustment(data.adjustment);
  if (data.adjustment.type !== type) throw Error('현재 조정과 종류가 다른 사전 설정입니다.');
  return data.adjustment;
}
