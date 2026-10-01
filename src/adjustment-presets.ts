import { makeAdjustment, type Adjustment, type AdjustmentType, type Cube } from './adjustments.ts';
export const photoFilters = [
  ['Warming (85)', '#ec8a00'],
  ['Warming (LBA)', '#fa9600'],
  ['Warming (81)', '#ebb113'],
  ['Cooling (80)', '#006dff'],
  ['Cooling (LBB)', '#005dff'],
  ['Cooling (82)', '#00b5ff'],
  ['Red', '#ea1a1a'],
  ['Orange', '#ff9900'],
  ['Yellow', '#ffeb00'],
  ['Green', '#19c419'],
  ['Cyan', '#00d8d8'],
  ['Blue', '#1e32ff'],
  ['Violet', '#7e1ec7'],
  ['Magenta', '#d6009c'],
  ['Sepia', '#ac7a33'],
  ['Deep Red', '#b50000'],
  ['Deep Blue', '#002bb0'],
  ['Deep Emerald', '#008b61'],
  ['Deep Yellow', '#e8c400'],
  ['Underwater', '#00bfa5'],
];
type Preset = { name: string; make: () => Adjustment };
export function presetsFor(type: AdjustmentType): Preset[] {
  const out: Preset[] = [];
  const add = (name: string, values: Record<string, number>, colors?: string[]) =>
    out.push({
      name,
      make: () => ({
        ...makeAdjustment(type),
        values: { ...makeAdjustment(type).values, ...values },
        ...(colors ? { colors } : {}),
      }),
    });
  if (type === 'levels') {
    add('기본값', {});
    add('명암 강화', { rgbBlack: 15, rgbWhite: 240 });
    add('중간톤 밝게', { rgbGamma: 1.2 });
    add('부드러운 출력', { rgbOutBlack: 15, rgbOutWhite: 240 });
  }
  if (type === 'curves') {
    for (const [name, y1, y2] of [
      ['명암 강화', 48, 208],
      ['부드러운 대비', 80, 176],
      ['중간톤 밝게', 90, 218],
    ] as const)
      out.push({
        name,
        make: () => {
          const a = makeAdjustment(type);
          a.curves!.rgb = [
            { x: 0, y: 0 },
            { x: 64, y: y1 },
            { x: 192, y: y2 },
            { x: 255, y: 255 },
          ];
          return a;
        },
      });
  }
  if (type === 'vibrance') {
    add('인물 생동감', { vibrance: 25, skin: 1 });
    add('풍경 생동감', { vibrance: 40, saturation: 10 });
    add('절제된 색', { vibrance: -30, saturation: -10 });
  }
  if (type === 'hsl') {
    add('기본값', {});
    add('채도 높이기', { saturation: 25 });
    add('세피아 색상화', { colorize: 1, colorizeHue: 35, colorizeSaturation: 25 });
  }
  if (type === 'balance') {
    add('따뜻한 중간톤', { midtonesR: 10, midtonesB: -10 });
    add('차가운 그림자', { shadowsB: 10, shadowsR: -5 });
  }
  if (type === 'blackwhite') {
    add('기본값', {});
    add('빨강 강조', { color0: 120, color1: 110, color2: 10, color3: 10, color4: 0, color5: 100 });
    add('파랑 강조', { color0: 0, color1: 10, color2: 30, color3: 90, color4: 120, color5: 60 });
    add('적외선 느낌', {
      color0: 70,
      color1: 140,
      color2: 180,
      color3: 20,
      color4: -50,
      color5: 20,
    });
    add('세피아', { tint: 1, tintHue: 40, tintSaturation: 25 });
  }
  if (type === 'mixer') {
    add('기본값', {});
    add('흑백 명도', { mono: 1, rR: 21, rG: 72, rB: 7 });
    add('빨강/파랑 교환', { rR: 0, rB: 100, bB: 0, bR: 100 });
  }
  if (type === 'posterize') {
    add('4단계', { steps: 4 });
    add('8단계', { steps: 8 });
    add('16단계', { steps: 16 });
  }
  if (type === 'threshold') {
    add('중간 밝기', { threshold: 128 });
    add('밝은 영역', { threshold: 192 });
    add('어두운 영역', { threshold: 64 });
  }
  if (type === 'gradient') {
    add('검정 → 흰색', {}, ['#000000', '#ffffff']);
    add('차가운 그림자 · 따뜻한 빛', {}, ['#152d54', '#ffda9c']);
    out.push({
      name: '다중 색상',
      make: () => ({
        ...makeAdjustment(type),
        stops: [
          { position: 0, color: '#132440', midpoint: 50 },
          { position: 50, color: '#c47668', midpoint: 50 },
          { position: 100, color: '#fff0c0', midpoint: 50 },
        ],
      }),
    });
  }
  if (type === 'selective') {
    add('기본값', {});
    add('초록 다듬기', { '2C': 15, '2Y': 10 });
    add('검정 깊게', { '8K': 10 });
  }
  return out;
}
export function lookupPreset(name: string): Cube {
  const c: Cube = {
    name: 'Photoshot / ' + name,
    size: 17,
    min: [0, 0, 0],
    max: [1, 1, 1],
    data: [],
  };
  for (let b = 0; b < 17; b++)
    for (let g = 0; g < 17; g++)
      for (let r = 0; r < 17; r++) {
        const x = [r / 16, g / 16, b / 16];
        if (name === 'Warm Portrait') {
          x[0] = x[0] * 0.98 + 0.025;
          x[1] *= 0.99;
          x[2] *= 0.94;
        }
        if (name === 'Cool Shadows') {
          const y = (x[0] + x[1] + x[2]) / 3;
          x[0] -= 0.025 * (1 - y);
          x[2] += 0.05 * (1 - y);
        }
        if (name === 'Soft Film') for (let k = 0; k < 3; k++) x[k] = 0.035 + 0.93 * x[k];
        c.data.push(...x.map((v) => Math.max(0, Math.min(1, v))));
      }
  return c;
}
