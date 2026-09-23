'use client';
import { useEffect, useRef } from 'react';
import { composite, type StudioDoc } from './document';

// Preview and export share the same compositor, including alpha, masks and clipped adjustments.
export default function Stage({
  doc,
  onError,
  clipping = false,
}: {
  doc: StudioDoc;
  onError: (message: string) => void;
  clipping?: boolean;
}) {
  const host = useRef<HTMLCanvasElement>(null);
  const revision = useRef(0),
    current = useRef(doc),
    rendering = useRef(false),
    mounted = useRef(false);
  current.current = doc;
  const clippingRef = useRef(clipping);
  clippingRef.current = clipping;
  async function drain() {
    if (rendering.current) return;
    rendering.current = true;
    try {
      while (mounted.current) {
        const r = revision.current,
          d = current.current;
        try {
          const image = await composite(d, false, {
            maxEdge: 1600,
            cancelled: () => !mounted.current || r !== revision.current,
          });
          if (!mounted.current) break;
          if (r === revision.current && host.current) {
            if (clippingRef.current) {
              const ctx = image.getContext('2d')!,
                pixels = ctx.getImageData(0, 0, image.width, image.height),
                p = pixels.data;
              for (let i = 0; i < p.length; i += 4) {
                if (!p[i + 3]) continue;
                if (Math.max(p[i], p[i + 1], p[i + 2]) === 255) {
                  p[i] = 255;
                  p[i + 1] = 40;
                  p[i + 2] = 40;
                } else if (Math.min(p[i], p[i + 1], p[i + 2]) === 0) {
                  p[i] = 30;
                  p[i + 1] = 100;
                  p[i + 2] = 255;
                }
              }
              ctx.putImageData(pixels, 0, 0);
            }
            host.current.width = image.width;
            host.current.height = image.height;
            host.current.getContext('2d')!.drawImage(image, 0, 0);
          }
        } catch (e) {
          if ((e as Error).name !== 'AbortError')
            onError('이미지를 표시하지 못했습니다. 프로젝트를 저장한 뒤 다시 열어 주세요.');
        }
        if (r === revision.current) break;
      }
    } finally {
      rendering.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current++;
    };
  }, []);
  useEffect(() => {
    revision.current++;
    const frame = requestAnimationFrame(() => void drain());
    return () => cancelAnimationFrame(frame);
  }, [doc, clipping]);
  return (
    <div className="pixi-stage">
      <canvas ref={host} aria-label="이미지 미리보기" />
    </div>
  );
}
