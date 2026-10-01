'use client';
import { useEffect, useRef, useState } from 'react';
import {
  makeAdjustment,
  definitions,
  parseLut,
  MAX_LUT_BYTES,
  type Adjustment,
  type GradientStop,
} from './adjustments';
import { parseTonePreset, type TonePickRequest } from './tone-tools';
import type { ToneAnalysis } from './tone-analysis';
import { presetsFor, photoFilters, lookupPreset } from './adjustment-presets';
type Props = {
  value: Adjustment;
  disabled: boolean;
  onChange: (a: Adjustment) => void;
  onError: (s: string) => void;
  analysis?: ToneAnalysis | null;
  picker: TonePickRequest | null;
  onPick: (p: TonePickRequest | null) => void;
};
export default function AdvancedAdjustment({
  value: a,
  disabled,
  onChange,
  onError,
  analysis,
  picker,
  onPick,
}: Props) {
  const input = useRef<HTMLInputElement>(null),
    lut = useRef<HTMLInputElement>(null),
    [band, setBand] = useState(0),
    [busy, setBusy] = useState(false);
  const centers = useRef(a.bands?.map((b) => b.center));
  useEffect(() => {
    const next = a.bands?.map((b) => b.center);
    const changed = next?.findIndex((v, i) => centers.current && v !== centers.current[i]);
    if (changed !== undefined && changed >= 0) setBand(changed);
    centers.current = next;
  }, [a.bands]);
  const stopList =
    a.stops ?? a.colors?.map((color, i) => ({ position: i * 100, color, midpoint: 50 }));
  const changeStop = (i: number, patch: Partial<GradientStop>) => {
    const stops = structuredClone(stopList!);
    stops[i] = { ...stops[i], ...patch };
    onChange({ ...a, stops });
  };
  const presets = presetsFor(a.type);
  const save = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ format: 'photoshot-tone-preset', version: 1, adjustment: a })], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `Photoshot_${a.type}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <fieldset className="advanced-adjustment" disabled={disabled || busy}>
      {presets.length > 0 && (
        <label className="adjustment-select">
          사전 설정
          <select
            aria-label={`${definitions[a.type].name} 사전 설정`}
            value=""
            onChange={(e) => {
              const p = presets.find((p) => p.name === e.target.value);
              if (p) onChange({ ...p.make(), scope: a.scope });
            }}
          >
            <option value="">선택하세요</option>
            {presets.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
      {a.type === 'hsl' && (
        <>
          <label className="adjustment-select">
            개별 색상 범위
            <select
              aria-label="개별 색상 범위"
              value={band}
              onChange={(e) => setBand(+e.target.value)}
            >
              {['빨강', '노랑', '초록', '청록', '파랑', '자홍'].map((n, i) => (
                <option value={i} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <p className="adjustment-hint">
            위쪽 수치는 전체 색상, 아래쪽 수치는 선택한 색상 범위에 적용됩니다.
          </p>
          {(['center', 'width', 'feather', 'hue', 'saturation', 'lightness'] as const).map(
            (k, i) => {
              const bands = a.bands ?? makeAdjustment('hsl').bands!,
                b = bands[band];
              const min = i < 3 ? (i === 2 ? 1 : 0) : i === 3 ? -180 : -100,
                max = i === 0 ? 360 : i < 4 ? 180 : 100;
              return (
                <label className="advanced-number" key={k}>
                  {
                    [
                      '범위 중심 (°)',
                      '완전 적용 폭 (°)',
                      '경계 부드러움 (°)',
                      '색조',
                      '채도',
                      '명도',
                    ][i]
                  }
                  <input
                    aria-label={`선택 색상 ${k}`}
                    type="number"
                    min={min}
                    max={max}
                    value={b[k]}
                    onChange={(e) => {
                      if (e.target.value === '') return;
                      const next = structuredClone(bands);
                      next[band][k] = Math.max(min, Math.min(max, +e.target.value));
                      onChange({ ...a, bands: next });
                    }}
                  />
                </label>
              );
            },
          )}
          <div
            className="hue-range"
            style={{ background: 'linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)' }}
            aria-label="색상환 범위"
          />
          <button
            type="button"
            aria-pressed={!!picker}
            onClick={() => onPick(picker ? null : { mode: 'target', channel: 'rgb' })}
          >
            사진에서 색상 범위 선택
          </button>
          <p className="adjustment-hint">
            사진에서 선택한 색이 속한 범위의 중심을 갱신합니다. 색상화 모드에서는 개별 범위를
            사용하지 않습니다.
          </p>
        </>
      )}
      {a.type === 'blackwhite' && (
        <>
          <button
            type="button"
            disabled={!analysis?.count}
            onClick={() => {
              if (!analysis) return;
              const mean = (k: 'r' | 'g' | 'b') =>
                analysis.channelBins[k].reduce((n, x, i) => n + x * i, 0) / analysis.count;
              const m = [mean('r'), mean('g'), mean('b')],
                target = (m[0] + m[1] + m[2]) / 3;
              const defaults = [40, 60, 40, 60, 20, 80],
                correction = [
                  m[0],
                  (m[0] + m[1]) / 2,
                  m[1],
                  (m[1] + m[2]) / 2,
                  m[2],
                  (m[0] + m[2]) / 2,
                ];
              const values = { ...a.values };
              defaults.forEach(
                (v, i) =>
                  (values['color' + i] = Math.round(
                    Math.max(-100, Math.min(300, v + (target - correction[i]) * 0.3)),
                  )),
              );
              onChange({ ...a, values });
            }}
          >
            자동 흑백
          </button>
          <div className="tone-buttons">
            <button type="button" onClick={() => onPick({ mode: 'white', channel: 'rgb' })}>
              사진의 색을 밝게 +10
            </button>
            <button type="button" onClick={() => onPick({ mode: 'black', channel: 'rgb' })}>
              사진의 색을 어둡게 −10
            </button>
          </div>
        </>
      )}
      {a.type === 'photo' && (
        <label className="adjustment-select">
          필터
          <select
            aria-label="포토 필터 종류"
            value=""
            onChange={(e) => onChange({ ...a, colors: [e.target.value] })}
          >
            <option value="" disabled>
              사용자 정의 색상
            </option>
            {photoFilters.map(([name, color]) => (
              <option value={color} key={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {a.type === 'mixer' && (
        <div className="adjustment-hint" role="status">
          {(a.values.mono ? ['r'] : ['r', 'g', 'b']).map((c) => {
            const n = ['R', 'G', 'B'].reduce((sum, k) => sum + a.values[c + k], 0);
            return (
              <p key={c}>
                {a.values.mono ? '회색' : c.toUpperCase()} 합계: <strong>{n}%</strong>
                {n !== 100 ? ' · 100%와 달라 밝기가 변할 수 있습니다.' : ''}
              </p>
            );
          })}
        </div>
      )}
      {a.type === 'threshold' && (
        <div className="tone-histogram">
          <svg viewBox="0 0 256 60" role="img" aria-label="한계값 히스토그램">
            <path
              d={
                analysis?.count
                  ? 'M 0 60 ' +
                    analysis.bins
                      .map(
                        (n, i) =>
                          `L ${i} ${60 - (Math.log1p(n) / Math.max(1, ...analysis.bins.map(Math.log1p))) * 56}`,
                      )
                      .join(' ') +
                    ' L 255 60 Z'
                  : ''
              }
              fill="currentColor"
            />
            <line
              x1={a.values.threshold}
              x2={a.values.threshold}
              y1="0"
              y2="60"
              stroke="#fa763b"
              strokeWidth="2"
            />
          </svg>
          <span>어두움</span>
          <span>밝음</span>
        </div>
      )}
      {a.type === 'gradient' && stopList && (
        <>
          <div
            className="gradient-ramp"
            style={{
              background: `linear-gradient(90deg,${stopList.map((s) => `${s.color} ${s.position}%`).join(',')})`,
            }}
          />
          {stopList.map((s, i) => (
            <div className="gradient-stop" key={i}>
              <label>
                색 {i + 1}
                <input
                  aria-label={`그레이디언트 색 ${i + 1}`}
                  type="color"
                  value={s.color}
                  onChange={(e) => changeStop(i, { color: e.target.value })}
                />
              </label>
              <label>
                위치 %
                <input
                  aria-label={`색 ${i + 1} 위치`}
                  type="number"
                  min={i ? stopList[i - 1].position + 0.1 : 0}
                  max={i < stopList.length - 1 ? stopList[i + 1].position - 0.1 : 100}
                  step=".1"
                  disabled={i === 0 || i === stopList.length - 1}
                  value={s.position}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    changeStop(i, {
                      position: Math.max(
                        stopList[i - 1].position + 0.1,
                        Math.min(stopList[i + 1].position - 0.1, +e.target.value),
                      ),
                    });
                  }}
                />
              </label>
              {i < stopList.length - 1 && (
                <label>
                  중간점 %
                  <input
                    aria-label={`색 ${i + 1} 중간점`}
                    type="number"
                    min="1"
                    max="99"
                    value={s.midpoint}
                    onChange={(e) =>
                      changeStop(i, { midpoint: Math.max(1, Math.min(99, +e.target.value)) })
                    }
                  />
                </label>
              )}
              {i > 0 && i < stopList.length - 1 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...a, stops: stopList.filter((_, j) => j !== i) })}
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            disabled={stopList.length >= 32}
            onClick={() => {
              let i = 0;
              for (let j = 1; j < stopList.length - 1; j++)
                if (
                  stopList[j + 1].position - stopList[j].position >
                  stopList[i + 1].position - stopList[i].position
                )
                  i = j;
              const next = [...stopList];
              next.splice(i + 1, 0, {
                position: (stopList[i].position + stopList[i + 1].position) / 2,
                color: '#808080',
                midpoint: 50,
              });
              onChange({ ...a, stops: next });
            }}
          >
            중간 색상 추가
          </button>
        </>
      )}
      {a.type === 'lookup' && (
        <>
          <label className="adjustment-select">
            Photoshot 룩
            <select
              aria-label="LUT 사전 설정"
              value=""
              onChange={(e) => {
                if (e.target.value) onChange({ ...a, cube: lookupPreset(e.target.value) });
              }}
            >
              <option value="">선택하세요</option>
              {['Neutral', 'Warm Portrait', 'Cool Shadows', 'Soft Film'].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <input
            ref={lut}
            hidden
            type="file"
            accept=".cube,.3dl,.look,.csp,.icc,.icm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              try {
                if (f.size > MAX_LUT_BYTES) throw Error('LUT 파일은 32MB 이하만 지원합니다.');
                const cube = /\.(icc|icm)$/i.test(f.name)
                  ? await (
                      await import('./icc')
                    ).parseICC(new Uint8Array(await f.arrayBuffer()), f.name)
                  : parseLut(await f.text(), f.name);
                onChange({ ...a, cube });
              } catch (err) {
                onError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <button type="button" onClick={() => lut.current?.click()}>
            {busy ? '불러오는 중…' : 'LUT 파일 불러오기'}
          </button>
          <p className="adjustment-hint">
            {a.cube
              ? `${a.cube.name} · ${a.cube.only1d ? '1D' : a.cube.size + '³'}`
              : 'CUBE · 3DL · LOOK · CSP · ICC / 최대 65³ · 32MB'}
          </p>
          <p className="adjustment-hint">
            Photoshot 룩은 자체 제작 프리셋입니다. ICC는 Lab/XYZ Abstract·RGB Device Link를 sRGB 65³
            LUT로 변환합니다.
          </p>
          {a.cube && (
            <button
              type="button"
              onClick={() => {
                const next = { ...a };
                delete next.cube;
                onChange(next);
              }}
            >
              LUT 제거
            </button>
          )}
        </>
      )}
      {picker && ['hsl', 'blackwhite'].includes(a.type) && (
        <p role="status">
          사진을 클릭해 주세요.{' '}
          <button type="button" onClick={() => onPick(null)}>
            취소
          </button>
        </p>
      )}
      {!['levels', 'curves', 'exposure'].includes(a.type) && (
        <>
          <div className="tone-buttons">
            <button type="button" onClick={save}>
              설정 저장
            </button>
            <button type="button" onClick={() => input.current?.click()}>
              설정 불러오기
            </button>
          </div>
          <input
            ref={input}
            type="file"
            hidden
            accept=".json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                if (f.size > MAX_LUT_BYTES * 2) throw Error('설정 파일이 너무 큽니다.');
                const p = parseTonePreset(await f.text(), a.type);
                onChange({ ...p, scope: a.scope });
              } catch (err) {
                onError((err as Error).message);
              }
            }}
          />
        </>
      )}
    </fieldset>
  );
}
