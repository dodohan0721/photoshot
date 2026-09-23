/** Canvas blur uses a Gaussian kernel. Extend border pixels to avoid dark/transparent seams. */
export function gaussianBlur(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (!radius) return source;
  const pad = Math.ceil(radius * 3),
    w = source.width,
    h = source.height;
  const extended = document.createElement('canvas');
  extended.width = w + pad * 2;
  extended.height = h + pad * 2;
  const e = extended.getContext('2d')!;
  e.drawImage(source, pad, pad);
  e.drawImage(source, 0, 0, w, 1, pad, 0, w, pad);
  e.drawImage(source, 0, h - 1, w, 1, pad, pad + h, w, pad);
  e.drawImage(source, 0, 0, 1, h, 0, pad, pad, h);
  e.drawImage(source, w - 1, 0, 1, h, pad + w, pad, pad, h);
  for (const [sx, sy, dx, dy] of [
    [0, 0, 0, 0],
    [w - 1, 0, pad + w, 0],
    [0, h - 1, 0, pad + h],
    [w - 1, h - 1, pad + w, pad + h],
  ])
    e.drawImage(source, sx, sy, 1, 1, dx, dy, pad, pad);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  if (!('filter' in ctx))
    throw Error(
      '이 브라우저는 가우시안 흐림을 지원하지 않습니다. 최신 Chrome 또는 Edge에서 열어 주세요.',
    );
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(extended, -pad, -pad);
  extended.width = extended.height = 1;
  return out;
}
