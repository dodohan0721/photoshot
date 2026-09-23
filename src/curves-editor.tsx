'use client';
import { useEffect, useRef, useState } from 'react';
import { curveTable, type CurvePoint, type Channel, type Adjustment } from './adjustments';
import type { ToneAnalysis } from './tone-analysis';
type Props = {
  value: Adjustment;
  channel: Channel;
  analysis?: ToneAnalysis | null;
  disabled: boolean;
  onChange: (a: Adjustment) => void;
  onBegin: () => void;
  onEnd: () => void;
};
const colors = { rgb: '#beef72', r: '#ff7070', g: '#68d890', b: '#71a7ff' };
export default function CurvesEditor({
  value,
  channel,
  analysis,
  disabled,
  onChange,
  onBegin,
  onEnd,
}: Props) {
  const points = value.curves![channel],
    latest = useRef(points);
  latest.current = points;
  const [selected, setSelected] = useState(0),
    [draw, setDraw] = useState(false),
    [hist, setHist] = useState(true),
    [detailed, setDetailed] = useState(false),
    [overlays, setOverlays] = useState(false),
    [log, setLog] = useState(true);
  const drag = useRef<number | null>(null),
    last = useRef<CurvePoint | null>(null),
    index = Math.min(selected, points.length - 1),
    point = points[index];
  const table = curveTable(points),
    bins = analysis?.channelBins[channel] ?? [],
    max = Math.max(1, ...bins.map((n) => (log ? Math.log1p(n) : n)));
  const previous = useRef(points);
  useEffect(() => {
    if (points.length === previous.current.length + 1) {
      const added = points.findIndex((p) => !previous.current.some((old) => old.x === p.x));
      if (added >= 0) setSelected(added);
    }
    previous.current = points;
  }, [points]);
  const path = (t: ArrayLike<number>) => Array.from(t, (y, x) => `${x},${255 - y * 255}`).join(' ');
  const change = (p: CurvePoint[]) => {
    latest.current = p;
    onChange({ ...value, curves: { ...value.curves!, [channel]: p } });
  };
  const position = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(Math.max(0, Math.min(255, ((e.clientX - b.left) / b.width) * 255))),
      y: Math.round(Math.max(0, Math.min(255, 255 - ((e.clientY - b.top) / b.height) * 255))),
    };
  };
  function move(i: number, p: CurvePoint) {
    const all = latest.current;
    change(
      all.map((old, j) =>
        j === i
          ? {
              x:
                i === 0
                  ? 0
                  : i === all.length - 1
                    ? 255
                    : Math.max(all[i - 1].x + 1, Math.min(all[i + 1].x - 1, p.x)),
              y: Math.max(0, Math.min(255, p.y)),
            }
          : old,
      ),
    );
  }
  function paint(p: CurvePoint) {
    const prev = last.current ?? p,
      arr = Array.from(curveTable(latest.current), (y, x) => ({ x, y: Math.round(y * 255) }));
    for (let x = Math.min(prev.x, p.x); x <= Math.max(prev.x, p.x); x++)
      arr[x].y = Math.round(
        prev.y + (p.y - prev.y) * (p.x === prev.x ? 1 : (x - prev.x) / (p.x - prev.x)),
      );
    last.current = p;
    change(arr);
  }
  function remove() {
    if (index > 0 && index < points.length - 1) {
      change(points.filter((_, i) => i !== index));
      setSelected(0);
    }
  }
  return (
    <div className="curve-editor enhanced-curve">
      <div className="tone-buttons">
        <button type="button" aria-pressed={!draw} onClick={() => setDraw(false)}>
          제어점
        </button>
        <button type="button" aria-pressed={draw} onClick={() => setDraw(true)}>
          연필
        </button>
        <button
          type="button"
          onClick={() => {
            const t = curveTable(points);
            change(
              Array.from(t, (y, x) => ({
                x,
                y: Math.round(
                  ((t[Math.max(0, x - 2)] +
                    t[Math.max(0, x - 1)] +
                    y +
                    t[Math.min(255, x + 1)] +
                    t[Math.min(255, x + 2)]) /
                    5) *
                    255,
                ),
              })),
            );
          }}
        >
          부드럽게
        </button>
      </div>
      <svg
        viewBox="0 0 255 255"
        preserveAspectRatio="none"
        role="img"
        aria-label="조정 곡선 그래프"
        tabIndex={0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (['Delete', 'Backspace'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            remove();
          } else if (e.key.startsWith('Arrow')) {
            e.preventDefault();
            e.stopPropagation();
            const n = e.shiftKey ? 10 : 1;
            move(index, {
              x: point.x + (e.key === 'ArrowRight' ? n : e.key === 'ArrowLeft' ? -n : 0),
              y: point.y + (e.key === 'ArrowUp' ? n : e.key === 'ArrowDown' ? -n : 0),
            });
          }
        }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          onBegin();
          const p = position(e);
          if (draw) {
            paint(p);
            return;
          }
          let i = points.findIndex((v) => Math.hypot(v.x - p.x, v.y - p.y) < 10);
          if (i < 0) {
            if (points.length >= 16) return;
            const near = points.findIndex((v) => Math.abs(v.x - p.x) < 2);
            if (near >= 0) i = near;
            else {
              const all = [...points, p].sort((a, b) => a.x - b.x);
              i = all.indexOf(p);
              change(all);
            }
          }
          setSelected(i);
          drag.current = i;
        }}
        onPointerMove={(e) => {
          if (draw && last.current) paint(position(e));
          else if (drag.current !== null) move(drag.current, position(e));
        }}
        onPointerUp={(e) => {
          if (drag.current !== null) {
            const b = e.currentTarget.getBoundingClientRect(),
              i = drag.current;
            if (
              (e.clientX < b.left - 12 ||
                e.clientX > b.right + 12 ||
                e.clientY < b.top - 12 ||
                e.clientY > b.bottom + 12) &&
              i > 0 &&
              i < latest.current.length - 1
            ) {
              change(latest.current.filter((_, j) => j !== i));
              setSelected(0);
            }
          }
          drag.current = null;
          last.current = null;
          onEnd();
        }}
        onPointerCancel={() => {
          drag.current = null;
          last.current = null;
          onEnd();
        }}
      >
        <rect width="255" height="255" fill="#15171a" />
        {hist && (
          <path
            aria-label="곡선 입력 히스토그램"
            d={
              'M 0 255 ' +
              bins
                .map((n, x) => `L ${x} ${255 - ((log ? Math.log1p(n) : n) / max) * 244}`)
                .join(' ') +
              ' L 255 255 Z'
            }
            fill={colors[channel]}
            opacity=".22"
          />
        )}
        {Array.from({ length: detailed ? 11 : 5 }, (_, i) => (i * 255) / (detailed ? 10 : 4)).map(
          (n) => (
            <path key={n} d={`M ${n} 0 V 255 M 0 ${n} H 255`} stroke="#34383e" />
          ),
        )}
        <path d="M 0 255 L 255 0" stroke="#777" strokeDasharray="4 4" />
        {overlays &&
          (['r', 'g', 'b'] as Channel[])
            .filter((c) => c !== channel)
            .map((c) => (
              <polyline
                key={c}
                points={path(curveTable(value.curves![c]))}
                fill="none"
                stroke={colors[c]}
                strokeWidth="1"
                opacity=".7"
              />
            ))}
        <path
          d={`M ${point.x} 255 V ${255 - point.y} H 0`}
          fill="none"
          stroke="#aaa"
          strokeDasharray="2 3"
        />
        <polyline points={path(table)} fill="none" stroke={colors[channel]} strokeWidth="2" />
        {points.length <= 16 &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={255 - p.y}
              r={i === index ? 5 : 3}
              fill={i === index ? colors[channel] : '#fff'}
            />
          ))}
      </svg>
      <div className="curve-options">
        {[
          ['히스토그램', hist, setHist],
          ['로그 보기', log, setLog],
          ['상세 격자', detailed, setDetailed],
          ['채널 겹쳐 보기', overlays, setOverlays],
        ].map(([label, checked, set]) => (
          <label key={String(label)}>
            <input
              type="checkbox"
              checked={checked as boolean}
              onChange={(e) => (set as (v: boolean) => void)(e.target.checked)}
            />
            {String(label)}
          </label>
        ))}
      </div>
      <div className="curve-points">
        <label>
          제어점
          <select
            aria-label="곡선 제어점"
            value={index}
            onChange={(e) => setSelected(+e.target.value)}
          >
            {points.map((p, i) => (
              <option key={i} value={i}>
                {i + 1} · {p.x} → {p.y}
              </option>
            ))}
          </select>
        </label>
        <label>
          입력
          <input
            aria-label="곡선 입력"
            type="number"
            min="0"
            max="255"
            value={point.x}
            disabled={index === 0 || index === points.length - 1}
            onChange={(e) => {
              if (e.target.value !== '') move(index, { ...point, x: Math.round(+e.target.value) });
            }}
          />
        </label>
        <label>
          출력
          <input
            aria-label="곡선 출력"
            type="number"
            min="0"
            max="255"
            value={point.y}
            onChange={(e) => {
              if (e.target.value !== '') move(index, { ...point, y: Math.round(+e.target.value) });
            }}
          />
        </label>
      </div>
      <div className="tone-buttons">
        <button
          type="button"
          disabled={index === 0 || index === points.length - 1}
          onClick={remove}
        >
          점 삭제
        </button>
        <button
          type="button"
          onClick={() => {
            change([
              { x: 0, y: 0 },
              { x: 64, y: 46 },
              { x: 192, y: 210 },
              { x: 255, y: 255 },
            ]);
            setSelected(0);
          }}
        >
          S 곡선
        </button>
        <button
          type="button"
          onClick={() => {
            change([
              { x: 0, y: 24 },
              { x: 128, y: 138 },
              { x: 255, y: 242 },
            ]);
            setSelected(0);
          }}
        >
          매트
        </button>
        <button
          type="button"
          onClick={() => {
            change([
              { x: 0, y: 0 },
              { x: 255, y: 255 },
            ]);
            setSelected(0);
          }}
        >
          직선
        </button>
      </div>
      {points.length > 16 && (
        <p className="adjustment-hint">
          연필 곡선 · 256단계. 제어점 편집은 직선 또는 S 곡선으로 전환하세요.
        </p>
      )}
    </div>
  );
}
