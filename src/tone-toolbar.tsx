'use client';
import { useRef, useState } from 'react';
import { makeAdjustment, type Adjustment, type Channel } from './adjustments';
import {
  autoCurves,
  autoLevels,
  parseAcv,
  encodeAcv,
  parseTonePreset,
  type TonePickRequest,
} from './tone-tools';
import type { ToneAnalysis } from './tone-analysis';
export default function ToneToolbar({
  value,
  channel,
  analysis,
  busy,
  disabled,
  picker,
  onPick,
  onChange,
  onError,
}: {
  value: Adjustment;
  channel: Channel;
  analysis?: ToneAnalysis | null;
  busy?: boolean;
  disabled: boolean;
  picker: TonePickRequest | null;
  onPick: (r: TonePickRequest | null) => void;
  onChange: (a: Adjustment) => void;
  onError: (s: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [autoMode, setAutoMode] = useState('contrast'),
    [clip, setClip] = useState(0.5);
  const save = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { format: 'photoshot-tone-preset', version: 1, adjustment: value },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `Photoshot_${value.type}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <fieldset className="tone-toolbar" disabled={disabled}>
      {['curves', 'levels'].includes(value.type) ? (
        <div className="tone-auto">
          <label>
            자동 보정 방식
            <select
              aria-label="자동 보정 방식"
              value={autoMode}
              onChange={(e) => setAutoMode(e.target.value)}
            >
              <option value="contrast">명암 대비</option>
              <option value="color">채널별 색상</option>
            </select>
          </label>
          <label>
            양끝 제외 %
            <input
              aria-label="자동 제외 비율"
              type="number"
              min="0"
              max="5"
              step=".1"
              value={clip}
              onChange={(e) => setClip(Math.max(0, Math.min(5, +e.target.value)))}
            />
          </label>
          <button
            type="button"
            disabled={busy || !analysis?.count}
            onClick={() =>
              analysis &&
              onChange(
                (value.type === 'levels' ? autoLevels : autoCurves)(
                  value,
                  analysis,
                  autoMode === 'color',
                  clip / 100,
                ),
              )
            }
          >
            {busy ? '분석 중…' : '자동'}
          </button>
        </div>
      ) : (
        <label className="adjustment-select">
          사전 설정
          <select
            aria-label="노출 사전 설정"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value === '') return;
              onChange({
                ...value,
                values: { ...makeAdjustment('exposure').values, ev: Number(e.target.value) },
              });
              e.target.value = '';
            }}
          >
            <option value="">선택하세요</option>
            <option value="0">기본값</option>
            <option value="1">+1 스톱</option>
            <option value="2">+2 스톱</option>
            <option value="-1">−1 스톱</option>
            <option value="-2">−2 스톱</option>
          </select>
        </label>
      )}
      <div className="tone-buttons">
        {(['black', 'gray', 'white'] as const).map((mode, i) => (
          <button
            type="button"
            key={mode}
            aria-pressed={picker?.mode === mode}
            onClick={() => onPick(picker?.mode === mode ? null : { mode, channel })}
          >
            {['검정 스포이드', '회색 스포이드', '흰색 스포이드'][i]}
          </button>
        ))}
        {value.type === 'curves' && (
          <button
            type="button"
            aria-pressed={picker?.mode === 'target'}
            onClick={() => onPick(picker?.mode === 'target' ? null : { mode: 'target', channel })}
          >
            사진에서 제어점
          </button>
        )}
      </div>
      {picker && (
        <p role="status" className="adjustment-hint">
          사진의 원하는 부분을 클릭하세요.{' '}
          {picker.mode === 'target' ? '해당 밝기의 제어점이 추가됩니다.' : ''}{' '}
          <button type="button" onClick={() => onPick(null)}>
            취소
          </button>
        </p>
      )}
      <div className="tone-buttons">
        <button type="button" onClick={save}>
          설정 저장
        </button>
        <button type="button" onClick={() => input.current?.click()}>
          설정 불러오기
        </button>
      </div>
      {value.type === 'curves' && (
        <button
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([encodeAcv(value)]));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Photoshot_curves.acv';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Photoshop ACV 저장
        </button>
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept={value.type === 'curves' ? '.json,.acv' : '.json'}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            if (f.size > 100000) throw Error('사전 설정은 100KB 이하만 지원합니다.');
            const a = f.name.toLowerCase().endsWith('.acv')
              ? parseAcv(await f.arrayBuffer())
              : parseTonePreset(await f.text(), value.type);
            onChange({ ...a, scope: value.scope });
          } catch (err) {
            onError((err as Error).message);
          }
        }}
      />
    </fieldset>
  );
}
