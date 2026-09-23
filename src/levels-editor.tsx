'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Adjustment, Channel } from './adjustments';
import type { ToneAnalysis } from './tone-analysis';
import { gammaAtPosition, gammaPosition, levelsHistogramPath } from './levels-controls';
import './levels-editor.css';

type Props = {
  value: Adjustment;
  channel: Channel;
  analysis?: ToneAnalysis | null;
  busy?: boolean;
  disabled: boolean;
  onChange: (key: string, n: number) => void;
  onBegin: () => void;
  onEnd: () => void;
};
type HandleName = 'Black' | 'Gamma' | 'White' | 'OutBlack' | 'OutWhite';
type Handle = {
  name: HandleName;
  label: string;
  value: number;
  position: number;
  min: number;
  max: number;
  step: number;
  tone: string;
};
const channelNames = { rgb: 'RGB', r: '빨강', g: '초록', b: '파랑' };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default function LevelsEditor({
  value,
  channel,
  analysis,
  busy,
  disabled,
  onChange,
  onBegin,
  onEnd,
}: Props) {
  const [logarithmic, setLogarithmic] = useState(false);
  const inputTrack = useRef<HTMLDivElement>(null),
    outputTrack = useRef<HTMLDivElement>(null);
  const dragging = useRef<HandleName | null>(null);
  const v = value.values,
    b = v[channel + 'Black'],
    w = v[channel + 'White'],
    g = v[channel + 'Gamma'];
  const handles: Handle[] = [
    {
      name: 'Black',
      label: '입력 검정',
      value: b,
      position: b,
      min: 0,
      max: w - 1,
      step: 1,
      tone: 'black',
    },
    {
      name: 'Gamma',
      label: '중간톤',
      value: g,
      position: gammaPosition(b, w, g),
      min: 0.1,
      max: 10,
      step: 0.01,
      tone: 'gray',
    },
    {
      name: 'White',
      label: '입력 흰색',
      value: w,
      position: w,
      min: b + 1,
      max: 255,
      step: 1,
      tone: 'white',
    },
    {
      name: 'OutBlack',
      label: '출력 검정',
      value: v[channel + 'OutBlack'],
      position: v[channel + 'OutBlack'],
      min: 0,
      max: 255,
      step: 1,
      tone: 'black',
    },
    {
      name: 'OutWhite',
      label: '출력 흰색',
      value: v[channel + 'OutWhite'],
      position: v[channel + 'OutWhite'],
      min: 0,
      max: 255,
      step: 1,
      tone: 'white',
    },
  ];
  function set(h: Handle, n: number) {
    if (disabled) return;
    const next = clamp(h.step === 1 ? Math.round(n) : Math.round(n * 100) / 100, h.min, h.max);
    if (next !== h.value) onChange(channel + h.name, next);
  }
  function move(h: Handle, e: PointerEvent<HTMLButtonElement>) {
    const track = h.name.startsWith('Out') ? outputTrack.current : inputTrack.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const pos = clamp(((e.clientX - box.left) / box.width) * 255, 0, 255);
    set(h, h.name === 'Gamma' ? gammaAtPosition(b, w, pos) : pos);
  }
  function key(h: Handle, e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    let n = h.value;
    if (e.key === 'Home') n = h.min;
    else if (e.key === 'End') n = h.max;
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
      n +=
        h.step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
    onBegin();
    set(h, n);
  }
  function handle(h: Handle) {
    return (
      <button
        key={h.name}
        type="button"
        className={`levels-handle ${h.tone}`}
        style={{ left: `${(h.position / 255) * 100}%` }}
        role="slider"
        aria-label={`${h.label} 슬라이더`}
        aria-orientation="horizontal"
        aria-valuemin={h.min}
        aria-valuemax={h.max}
        aria-valuenow={h.value}
        aria-valuetext={h.name === 'Gamma' ? h.value.toFixed(2) : String(h.value)}
        title={`${h.label}: ${h.value}`}
        disabled={disabled}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          onBegin();
          dragging.current = h.name;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragging.current === h.name) move(h, e);
        }}
        onPointerUp={(e) => {
          dragging.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          onEnd();
        }}
        onPointerCancel={() => {
          dragging.current = null;
          onEnd();
        }}
        onLostPointerCapture={() => {
          dragging.current = null;
          onEnd();
        }}
        onKeyDown={(e) => key(h, e)}
        onKeyUp={onEnd}
        onBlur={onEnd}
      >
        <span aria-hidden="true" />
      </button>
    );
  }
  const bins = analysis?.channelBins[channel],
    hasPixels = !!analysis?.count;
  return (
    <div className="levels-editor" data-channel={channel}>
      <div className="levels-heading">
        <strong>입력 레벨</strong>
        <label title="작은 봉우리도 보기 쉽게 세로 높이를 로그로 표시합니다. 보정값은 바뀌지 않습니다.">
          <input
            type="checkbox"
            checked={logarithmic}
            onChange={(e) => setLogarithmic(e.target.checked)}
          />
          로그 보기
        </label>
      </div>
      <div className="levels-histogram" aria-busy={!!busy}>
        <svg
          viewBox="0 0 256 112"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${channelNames[channel]} 조정 전 히스토그램`}
        >
          <title>{channelNames[channel]} 입력값 분포 · 왼쪽 0, 오른쪽 255</title>
          {[64, 128, 192].map((x) => (
            <path key={x} d={`M ${x} 0 V 112`} className="levels-grid" />
          ))}
          <path
            className="levels-distribution"
            d={hasPixels && bins ? levelsHistogramPath(bins, logarithmic) : ''}
          />
        </svg>
        {!hasPixels && (
          <span className="levels-empty" role="status">
            {busy ? '이미지 분석 중…' : '분석할 이미지가 없습니다'}
          </span>
        )}
      </div>
      <div className="levels-track input" ref={inputTrack} aria-label="입력 레벨 조절">
        {handles.slice(0, 3).map(handle)}
      </div>
      <div className="levels-inputs">
        {handles.slice(0, 3).map((h) => (
          <LevelNumber
            key={h.name}
            handle={h}
            disabled={disabled}
            onChange={(n) => set(h, n)}
            onBegin={onBegin}
          />
        ))}
      </div>
      <p className="levels-reference">조정 전 분포 · 왼쪽은 어두움, 오른쪽은 밝음</p>
      <div className="levels-heading output-heading">
        <strong>출력 레벨</strong>
        <span>결과의 검정·흰색 범위</span>
      </div>
      <div className="levels-output-gradient" aria-hidden="true" />
      <div className="levels-track output" ref={outputTrack} aria-label="출력 레벨 조절">
        {handles.slice(3).map(handle)}
      </div>
      <div className="levels-inputs output">
        {handles.slice(3).map((h) => (
          <LevelNumber
            key={h.name}
            handle={h}
            disabled={disabled}
            onChange={(n) => set(h, n)}
            onBegin={onBegin}
          />
        ))}
      </div>
    </div>
  );
}
function LevelNumber({
  handle: h,
  disabled,
  onChange,
  onBegin,
}: {
  handle: Handle;
  disabled: boolean;
  onChange: (n: number) => void;
  onBegin: () => void;
}) {
  const format = (v: number) => (h.name === 'Gamma' ? v.toFixed(2) : String(v));
  const [draft, setDraft] = useState(() => format(h.value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current)
      setDraft(h.name === 'Gamma' ? h.value.toFixed(2) : String(h.value));
  }, [h.value, h.name]);
  const normalize = (v: number) =>
    clamp(h.step === 1 ? Math.round(v) : Math.round(v * 100) / 100, h.min, h.max);
  return (
    <label>
      <span>{h.label}</span>
      <input
        ref={input}
        type="number"
        aria-label={`${h.label} 수치`}
        disabled={disabled}
        min={h.min}
        max={h.max}
        step={h.step}
        value={draft}
        onFocus={(e) => {
          onBegin();
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber))
            onChange(normalize(e.target.valueAsNumber));
        }}
        onBlur={() => {
          const n =
            draft.trim() && Number.isFinite(Number(draft)) ? normalize(Number(draft)) : h.value;
          setDraft(format(n));
          onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = normalize(
              h.value + h.step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1),
            );
            setDraft(format(n));
            onChange(n);
          }
        }}
      />
    </label>
  );
}
