'use client';
import { useEffect, useRef, useState } from 'react';
import { Eye, RotateCcw, SlidersHorizontal } from 'lucide-react';
import LevelsEditor from './levels-editor';
import CurvesEditor from './curves-editor';
import ToneToolbar from './tone-toolbar';
import type { TonePickRequest } from './tone-tools';
import './tone-tools.css';
import type { ToneAnalysis } from './tone-analysis';
import {
  channels,
  definitions,
  makeAdjustment,
  type Adjustment,
  type Channel,
} from './adjustments';

type Props = {
  picker: TonePickRequest | null;
  onPick: (p: TonePickRequest | null) => void;
  value: Adjustment;
  disabled: boolean;
  onChange: (value: Adjustment) => void;
  onBegin: () => void;
  onEnd: () => void;
  onError: (message: string) => void;
  analysis?: ToneAnalysis | null;
  analysisBusy?: boolean;
  onCompare: (pressed: boolean) => void;
  comparing: boolean;
};
export default function AdjustmentPanel({
  value: a,
  disabled,
  onChange,
  onBegin,
  onEnd,
  onError,
  analysis,
  analysisBusy,
  onCompare,
  comparing,
  picker,
  onPick,
}: Props) {
  const [group, setGroup] = useState('rgb');
  const def = definitions[a.type];
  function change(key: string, n: number) {
    const values = { ...a.values, [key]: n };
    if (a.type === 'levels')
      for (const c of channels) {
        if (key === c + 'Black') values[key] = Math.min(n, values[c + 'White'] - 1);
        if (key === c + 'White') values[key] = Math.max(n, values[c + 'Black'] + 1);
      }
    onChange({ ...a, values });
  }
  const groups = [
    ['rgb', 'RGB'],
    ['r', '빨강'],
    ['g', '초록'],
    ['b', '파랑'],
  ];
  const currentGroup = group;
  return (
    <section className="adjustment-properties" aria-label={`${def.name} 조정 속성`}>
      <div className="adjustment-title">
        <SlidersHorizontal size={18} />
        <strong>{def.name}</strong>
        <span>조정 레이어</span>
      </div>
      {groups.length > 0 && (
        <label className="adjustment-select">
          채널
          <select
            aria-label="조정 채널"
            value={currentGroup}
            disabled={disabled}
            onChange={(e) => {
              onEnd();
              setGroup(e.target.value);
            }}
          >
            {groups.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset
        disabled={disabled}
        onPointerDownCapture={onBegin}
        onPointerUpCapture={(e) => {
          if ((e.target as HTMLInputElement).type !== 'number') onEnd();
        }}
        onPointerCancelCapture={onEnd}
        onKeyDownCapture={(e) => {
          if ((e.target as HTMLInputElement).type !== 'number') onBegin();
        }}
        onKeyUpCapture={(e) => {
          if ((e.target as HTMLInputElement).type !== 'number') onEnd();
        }}
        onBlur={onEnd}
      >
        {a.type === 'levels' && (
          <LevelsEditor
            key={currentGroup}
            value={a}
            channel={currentGroup as Channel}
            analysis={analysis}
            busy={analysisBusy}
            disabled={disabled}
            onChange={change}
            onBegin={onBegin}
            onEnd={onEnd}
          />
        )}
        {a.type === 'curves' && (
          <CurvesEditor
            value={a}
            channel={currentGroup as Channel}
            analysis={analysis}
            disabled={disabled}
            onChange={onChange}
            onBegin={onBegin}
            onEnd={onEnd}
          />
        )}
        {(a.type === 'levels'
          ? []
          : def.controls.filter((c) => !c.group || c.group === currentGroup)
        ).map((c) =>
          c.min === 0 && c.max === 1 ? (
            <label className="adjustment-check" key={c.key}>
              <input
                type="checkbox"
                aria-label={c.label}
                checked={!!a.values[c.key]}
                onChange={(e) => change(c.key, e.target.checked ? 1 : 0)}
              />
              {c.label}
            </label>
          ) : (
            <AdjustmentControl
              key={c.key}
              control={c}
              value={a.values[c.key]}
              onChange={(n) => change(c.key, n)}
              onBegin={onBegin}
            />
          ),
        )}
      </fieldset>
      {['curves', 'exposure'].includes(a.type) && (
        <ToneToolbar
          value={a}
          channel={currentGroup as Channel}
          analysis={analysis}
          busy={analysisBusy}
          disabled={disabled}
          picker={picker}
          onPick={onPick}
          onChange={onChange}
          onError={onError}
        />
      )}
      <p className="adjustment-fine-help">숫자 입력 · 방향키 미세 조정 · Shift로 10배</p>
      <label className="adjustment-select">
        적용 대상
        <select
          aria-label="조정 적용 대상"
          value={a.scope}
          disabled={disabled}
          onChange={(e) => onChange({ ...a, scope: e.target.value as Adjustment['scope'] })}
        >
          <option value="below">아래 레이어 전체</option>
          <option value="clipped">바로 아래 레이어에 클리핑</option>
        </select>
      </label>
      {a.scope === 'clipped' && (
        <p className="adjustment-hint">연속된 클리핑 조정은 같은 바탕 레이어에 적용됩니다.</p>
      )}
      <div className="adjustment-footer">
        <button
          className={comparing ? 'comparing' : ''}
          aria-label="누르는 동안 조정 전 보기"
          title="누르는 동안 이 조정 전의 상태를 봅니다"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onCompare(true);
          }}
          onPointerUp={() => onCompare(false)}
          onPointerCancel={() => onCompare(false)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              onCompare(true);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              onCompare(false);
            }
          }}
          onBlur={() => onCompare(false)}
        >
          <Eye size={15} />
          {comparing ? '조정 전 보는 중' : '누르고 전후 비교'}
        </button>
        <button
          disabled={disabled}
          onClick={() => onChange({ ...makeAdjustment(a.type), scope: a.scope })}
        >
          <RotateCcw size={15} />
          초기화
        </button>
      </div>
      <p className="adjustment-description">{def.description} 변경 내용은 바로 적용됩니다.</p>
    </section>
  );
}
const brightnessPresets = [
  { id: 'default', name: '기본값', brightness: 0, contrast: 0 },
  { id: 'bright', name: '밝게', brightness: 20, contrast: 5 },
  { id: 'dark', name: '어둡게', brightness: -20, contrast: 5 },
  { id: 'strong', name: '선명한 대비', brightness: 0, contrast: 25 },
  { id: 'soft', name: '부드러운 대비', brightness: 10, contrast: -20 },
];
function histogramPath(bins: number[]) {
  const max = Math.max(1, ...bins.map((n) => Math.log1p(n)));
  return (
    'M 0 48 ' +
    bins.map((n, i) => `L ${i} ${48 - (Math.log1p(n) / max) * 44}`).join(' ') +
    ' L 255 48 Z'
  );
}
function AdjustmentControl({
  control: c,
  value,
  onChange,
  onBegin,
}: {
  control: import('./adjustments').Control;
  value: number;
  onChange: (n: number) => void;
  onBegin: () => void;
}) {
  const [draft, setDraft] = useState(String(value)),
    input = useRef<HTMLInputElement>(null);
  const normalize = (n: number) => {
    const v = Math.max(c.min, Math.min(c.max, n));
    return c.step === 1 ? Math.round(v) : Number(v.toFixed(4));
  };
  useEffect(() => {
    if (document.activeElement !== input.current) setDraft(String(value));
  }, [value]);
  function arrows(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && e.currentTarget.type === 'number') {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    if (e.currentTarget.type === 'number' && ['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const sign = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1,
      next = normalize(value + sign * (c.step ?? 1) * (e.shiftKey ? 10 : 1));
    setDraft(String(next));
    if (next !== value) onChange(next);
  }
  return (
    <label className="adjustment-slider">
      <span>
        {c.label}
        <input
          ref={input}
          aria-label={`${c.label} 수치`}
          type="number"
          min={c.min}
          max={c.max}
          step={c.step}
          value={draft}
          onFocus={(e) => {
            onBegin();
            e.currentTarget.select();
          }}
          onKeyDown={arrows}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) {
              const n = normalize(e.target.valueAsNumber);
              if (n !== value) onChange(n);
            }
          }}
          onBlur={() => {
            const n =
              draft.trim() !== '' && Number.isFinite(Number(draft))
                ? normalize(Number(draft))
                : value;
            setDraft(String(n));
            if (n !== value) onChange(n);
          }}
        />
      </span>
      <div className="adjustment-track">
        <input
          aria-label={c.label}
          type="range"
          min={c.min}
          max={c.max}
          step={c.step}
          value={value}
          onKeyDown={arrows}
          onDoubleClick={() => onChange(c.initial)}
          onChange={(e) => onChange(+e.target.value)}
        />
        <span
          className="adjustment-zero"
          style={{ left: `${((c.initial - c.min) / (c.max - c.min)) * 100}%` }}
        />
      </div>
      <span className="adjustment-limits">
        <span>{c.min}</span>
        <button type="button" title={`${c.label} 기본값으로`} onClick={() => onChange(c.initial)}>
          {c.initial}
        </button>
        <span>{c.max}</span>
      </span>
    </label>
  );
}
