import {
  compileAdjustment,
  curveTable,
  naturalCurveTable,
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
  if (a.type === 'hsl') {
    const hi = Math.max(...rgb),
      lo = Math.min(...rgb),
      d = hi - lo;
    if (d < 3) throw Error('회색 대신 색상이 있는 부분을 선택해 주세요.');
    const hue =
      ((hi === rgb[0]
        ? (rgb[1] - rgb[2]) / d
        : hi === rgb[1]
          ? 2 + (rgb[2] - rgb[0]) / d
          : 4 + (rgb[0] - rgb[1]) / d) *
        60 +
        360) %
      360;
    const bands = structuredClone(a.bands ?? makeAdjustment('hsl').bands!);
    const i = Math.round(hue / 60) % 6;
    bands[i].center = hue;
    return { ...a, bands };
  }
  if (a.type === 'blackwhite') {
    const values = { ...a.values };
    const hi = Math.max(...rgb),
      lo = Math.min(...rgb),
      d = hi - lo;
    if (d < 3) throw Error('회색 대신 색상이 있는 부분을 선택해 주세요.');
    const hue =
      ((hi === rgb[0]
        ? (rgb[1] - rgb[2]) / d
        : hi === rgb[1]
          ? 2 + (rgb[2] - rgb[0]) / d
          : 4 + (rgb[0] - rgb[1]) / d) *
        60 +
        360) %
      360;
    const i = Math.round(hue / 60) % 6;
    values['color' + i] = clamp(values['color' + i] + (mode === 'black' ? -10 : 10), -100, 300);
    return { ...a, values };
  }
  if (a.type === 'levels') {
    const values = { ...a.values };
    const targets = channel === 'rgb' ? ['r', 'g', 'b'] : [channel];
    for (const c of targets) {
      const x = rgb[['r', 'g', 'b'].indexOf(c)],
        black = values[c + 'Black'],
        white = values[c + 'White'];
      if (mode === 'black') values[c + 'Black'] = Math.min(Math.round(x), white - 1);
      else if (mode === 'white') values[c + 'White'] = Math.max(Math.round(x), black + 1);
      else {
        const y = (x - black) / (white - black);
        if (y <= 0 || y >= 1) throw Error('중간 밝기의 회색 영역을 선택해 주세요.');
        values[c + 'Gamma'] = Math.round(clamp(Math.log(y) / Math.log(0.5), 0.1, 10) * 100) / 100;
      }
    }
    return { ...a, values };
  }

  if (a.type === 'curves') {
    const curves = structuredClone(a.curves!);
    if (mode === 'target') {
      const x = Math.round(
        channel === 'rgb'
          ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
          : rgb[['r', 'g', 'b'].indexOf(channel)],
      );
      curves[channel] = insertCurvePoint(
        curves[channel],
        x,
        (a.revision === 2 ? naturalCurveTable : curveTable)(curves[channel])[x] * 255,
      );
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
  const decode = (x: number) => (a.revision === 2 ? x ** 2.2 : linear(x));
  const y =
    0.2126 * decode(rgb[0] / 255) + 0.7152 * decode(rgb[1] / 255) + 0.0722 * decode(rgb[2] / 255);
  const values = { ...a.values };
  if (mode === 'black') values.offset = clamp(-y * 2 ** values.ev, -0.5, 0.5);
  else {
    if (y < 1e-6) throw Error('완전한 검정 대신 밝기가 있는 부분을 선택해 주세요.');
    const target = mode === 'white' ? 1 : decode(128 / 255);
    const raw = (target ** values.gamma - values.offset) / y;
    if (raw <= 0) throw Error('오프셋을 초기화한 뒤 다시 선택해 주세요.');
    values.ev = clamp(Math.log2(raw), -20, 20);
  }
  values.ev = Math.round(values.ev * 100) / 100;
  values.offset =
    (mode === 'black' ? Math.floor(values.offset * 10000) : Math.round(values.offset * 10000)) /
    10000;
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

export function autoLevels(
  a: Adjustment,
  analysis: ToneAnalysis,
  perChannel = false,
  clip = 0.005,
): Adjustment {
  const values = { ...makeAdjustment('levels').values };
  for (const channel of (perChannel ? ['r', 'g', 'b'] : ['rgb']) as Channel[]) {
    const bins = analysis.channelBins[channel],
      total = bins.reduce((x, y) => x + y, 0);
    if (!total) continue;
    const q = (fraction: number) => {
      let sum = 0;
      for (let i = 0; i < 256; i++) {
        sum += bins[i];
        if (sum > total * fraction || (fraction === 1 && sum === total && bins[i] > 0)) return i;
      }
      return 255;
    };
    const low = q(clip),
      high = q(1 - clip);
    if (high - low < 2) continue;
    values[channel + 'Black'] = low;
    values[channel + 'White'] = high;
  }
  return { ...a, values };
}
export function parseAcv(buffer: ArrayBuffer): Adjustment {
  const view = new DataView(buffer);
  let offset = 0;
  const read = () => {
    if (offset + 2 > view.byteLength) throw Error('ACV 파일이 잘렸습니다.');
    const n = view.getUint16(offset, false);
    offset += 2;
    return n;
  };
  const version = read(),
    count = read();
  if (![1, 4].includes(version) || count < 1 || count > 4)
    throw Error('RGB용 1~4채널 ACV 파일을 선택하세요.');
  const a = makeAdjustment('curves');
  for (let k = 0; k < count; k++) {
    const n = read();
    if (n < 2 || n > 256) throw Error('ACV 제어점 개수가 올바르지 않습니다.');
    const pts: CurvePoint[] = [];
    for (let i = 0; i < n; i++) {
      const y = read(),
        x = read();
      if (x > 255 || y > 255) throw Error('8비트 ACV 제어점 범위를 벗어났습니다.');
      pts.push({ x, y });
    }
    pts.sort((x, y) => x.x - y.x);
    if (pts[0].x !== 0) pts.unshift({ x: 0, y: pts[0].y });
    if (pts.at(-1)!.x !== 255) pts.push({ x: 255, y: pts.at(-1)!.y });
    a.curves![(['rgb', 'r', 'g', 'b'] as Channel[])[k]] = pts;
  }
  validateAdjustment(a);
  return a;
}
export function encodeAcv(a: Adjustment): ArrayBuffer {
  validateAdjustment(a);
  if (a.type !== 'curves') throw Error('곡선 설정을 선택하세요.');
  const channels: Channel[] = ['rgb', 'r', 'g', 'b'];
  const out = new ArrayBuffer(4 + channels.reduce((n, c) => n + 2 + a.curves![c].length * 4, 0)),
    v = new DataView(out);
  let at = 0;
  const put = (n: number) => {
    v.setUint16(at, Math.round(n), false);
    at += 2;
  };
  put(4);
  put(4);
  for (const c of channels) {
    put(a.curves![c].length);
    for (const p of a.curves![c]) {
      put(p.y);
      put(p.x);
    }
  }
  return out;
}

export function autoBrightness(value: Adjustment, analysis: ToneAnalysis): Adjustment {
  const next = structuredClone(value);
  if (value.revision !== 2 || value.values.legacy) {
    next.values = { ...next.values, brightness: analysis.brightness, contrast: analysis.contrast };
    return next;
  }
  next.values.contrast = 0;
  const out: [number, number, number] = [0, 0, 0];
  let best = Infinity,
    brightness = 0;
  for (let n = -100; n <= 100; n++) {
    next.values.brightness = n;
    compileAdjustment(next)(analysis.median, analysis.median, analysis.median, out);
    const error = Math.abs(out[0] - 0.5);
    if (error < best) {
      best = error;
      brightness = n;
    }
  }
  next.values.brightness = brightness;
  let contrast = 0;
  best = Infinity;
  if (analysis.high - analysis.low > 20)
    for (let n = -40; n <= 60; n++) {
      next.values.contrast = n;
      const fn = compileAdjustment(next);
      fn(analysis.low, analysis.low, analysis.low, out);
      const low = out[0];
      fn(analysis.high, analysis.high, analysis.high, out);
      const error = Math.abs(out[0] - low - 0.8);
      if (error < best) {
        best = error;
        contrast = n;
      }
    }
  next.values.contrast = contrast;
  return next;
}
