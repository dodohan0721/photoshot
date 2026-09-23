import { gaussianBlur } from './gaussian.ts';
import {
  adjustPixels,
  compileAdjustment,
  isIdentityAdjustment,
  validateAdjustment,
  type Adjustment,
} from './adjustments.ts';
export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; size: number; color: string; erase: boolean };
export type LayerMask = {
  width: number;
  height: number;
  enabled: boolean;
  inverted: boolean;
  strokes: Stroke[];
  raster?: { width: number; height: number; alpha: number[] };
  polygon?: Point[];
};
export type Layer = {
  id: string;
  name: string;
  kind: 'image' | 'text' | 'paint' | 'adjustment';
  src?: string;
  text: string;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blend: 'normal' | 'multiply' | 'screen' | 'overlay';
  brightness: number;
  contrast: number;
  saturation: number;
  strokes: Stroke[];
  mask?: LayerMask;
  adjustment?: Adjustment;
  gaussian?: { radius: number; enabled: boolean };
};
export type StudioDoc = {
  format: 'layer-studio';
  version: 1 | 2;
  name: string;
  width: number;
  height: number;
  layers: Layer[];
};
export const uid = () => crypto.randomUUID();
export function makeLayer(part: Partial<Layer> = {}): Layer {
  return {
    id: uid(),
    name: '새 레이어',
    kind: 'paint',
    text: '',
    fontSize: 80,
    color: '#bfff50',
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blend: 'normal',
    brightness: 100,
    contrast: 100,
    saturation: 100,
    strokes: [],
    ...part,
  };
}
export const blankDoc = (): StudioDoc => ({
  format: 'layer-studio',
  version: 1,
  name: '제목 없는 프로젝트',
  width: 1200,
  height: 800,
  layers: [],
});
const images = new Map<string, HTMLImageElement>();
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = images.get(src);
  if (cached) return cached;
  const img = new Image();
  img.src = src;
  await img.decode();
  if (images.size > 50) images.clear();
  images.set(src, img);
  return img;
}
export function surface(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
export function maskSurface(mask: LayerMask, width = mask.width, height = mask.height) {
  const c = surface(width, height),
    ctx = c.getContext('2d')!;
  ctx.scale(c.width / mask.width, c.height / mask.height);
  ctx.fillStyle = '#fff';
  if (mask.raster) {
    const r = mask.raster,
      b = surface(r.width, r.height),
      g = b.getContext('2d')!,
      im = g.createImageData(r.width, r.height);
    for (let i = 0; i < r.alpha.length; i++) {
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 255;
      im.data[i * 4 + 3] = r.alpha[i];
    }
    g.putImageData(im, 0, 0);
    ctx.drawImage(b, 0, 0, mask.width, mask.height);
  } else if (mask.polygon) {
    ctx.beginPath();
    mask.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  } else ctx.fillRect(0, 0, mask.width, mask.height);
  for (const s of mask.strokes) {
    if (!s.points.length) continue;
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  if (mask.inverted) {
    const inv = surface(c.width, c.height),
      i = inv.getContext('2d')!;
    i.fillStyle = '#fff';
    i.fillRect(0, 0, c.width, c.height);
    i.globalCompositeOperation = 'destination-out';
    i.drawImage(c, 0, 0);
    return inv;
  }
  return c;
}
export async function layerSurface(layer: Layer) {
  const c = surface(layer.width, layer.height),
    ctx = c.getContext('2d')!;
  if (layer.src) ctx.drawImage(await loadImage(layer.src), 0, 0, c.width, c.height);
  if (layer.kind === 'text') {
    ctx.fillStyle = layer.color;
    ctx.font = `600 ${layer.fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    layer.text.split('\n').forEach((line, i) => ctx.fillText(line, 0, i * layer.fontSize * 1.25));
  }
  for (const s of layer.strokes) {
    if (!s.points.length) continue;
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (layer.brightness !== 100 || layer.contrast !== 100 || layer.saturation !== 100) {
    const out = surface(c.width, c.height),
      o = out.getContext('2d')!;
    o.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%) saturate(${layer.saturation}%)`;
    o.drawImage(c, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(out, 0, 0);
  }
  if (layer.gaussian?.enabled && layer.gaussian.radius > 0) {
    const blurred = gaussianBlur(c, layer.gaussian.radius);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(blurred, 0, 0);
  }
  if (layer.mask?.enabled) {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskSurface(layer.mask), 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  return c;
}
// Bounded source cache: adjustments reuse unchanged raster layers without retaining unbounded canvases.
const rasterCache = new Map<Layer, HTMLCanvasElement>();
let cachedPixels = 0;
async function cachedSurface(layer: Layer) {
  const cached = rasterCache.get(layer);
  if (cached) return cached;
  const image = await layerSurface(layer),
    pixels = image.width * image.height;
  while (rasterCache.size && (cachedPixels + pixels > 16_777_216 || rasterCache.size >= 8)) {
    const key = rasterCache.keys().next().value!;
    const old = rasterCache.get(key)!;
    cachedPixels -= old.width * old.height;
    rasterCache.delete(key);
  }
  if (pixels <= 16_777_216) {
    rasterCache.set(layer, image);
    cachedPixels += pixels;
  }
  return image;
}
export type RenderOptions = { maxEdge?: number; cancelled?: () => boolean };
function checkRender(options: RenderOptions) {
  if (options.cancelled?.()) throw new DOMException('Superseded render', 'AbortError');
}
function drawPositioned(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  layer: Layer,
  sx: number,
  sy: number,
) {
  ctx.save();
  ctx.scale(sx, sy);
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();
}
async function adjustCanvas(
  canvas: HTMLCanvasElement,
  layer: Layer,
  sx: number,
  sy: number,
  options: RenderOptions,
) {
  if (!layer.visible || !layer.adjustment || layer.opacity === 0) return;
  if (layer.blend === 'normal' && isIdentityAdjustment(layer.adjustment)) return;
  if (
    layer.mask?.enabled &&
    layer.mask.inverted &&
    !layer.mask.polygon &&
    !layer.mask.raster &&
    !layer.mask.strokes.length
  )
    return;
  checkRender(options);
  const ctx = canvas.getContext('2d')!,
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let mask: Uint8ClampedArray | undefined;
  const opaqueMask =
    layer.mask &&
    !layer.mask.inverted &&
    !layer.mask.polygon &&
    !layer.mask.raster &&
    !layer.mask.strokes.length &&
    layer.rotation === 0 &&
    layer.x <= 0 &&
    layer.y <= 0 &&
    (layer.x + layer.width) * sx >= canvas.width &&
    (layer.y + layer.height) * sy >= canvas.height;
  if (layer.mask?.enabled && !opaqueMask) {
    const m = surface(canvas.width, canvas.height);
    drawPositioned(
      m.getContext('2d')!,
      maskSurface(layer.mask, Math.max(1, layer.width * sx), Math.max(1, layer.height * sy)),
      layer,
      sx,
      sy,
    );
    mask = m.getContext('2d')!.getImageData(0, 0, m.width, m.height).data;
  }
  const compiled = compileAdjustment(layer.adjustment),
    chunk = Math.max(canvas.width * 4, 262144);
  for (let start = 0; start < pixels.data.length; start += chunk) {
    checkRender(options);
    adjustPixels(
      pixels.data,
      layer.adjustment,
      layer.opacity,
      mask,
      layer.blend,
      start,
      Math.min(start + chunk, pixels.data.length),
      compiled,
    );
    if (pixels.data.length > chunk) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  checkRender(options);
  ctx.putImageData(pixels, 0, 0);
}
export async function composite(doc: StudioDoc, white = false, options: RenderOptions = {}) {
  const ratio = options.maxEdge
    ? Math.min(1, options.maxEdge / Math.max(doc.width, doc.height))
    : 1;
  const c = surface(doc.width * ratio, doc.height * ratio),
    ctx = c.getContext('2d')!;
  const sx = c.width / doc.width,
    sy = c.height / doc.height;
  for (let index = 0; index < doc.layers.length; index++) {
    checkRender(options);
    const layer = doc.layers[index];
    // Consecutive clipped adjustments belong to their immediate base, even when the base is hidden.
    const clipped: Layer[] = [];
    while (
      doc.layers[index + 1]?.kind === 'adjustment' &&
      doc.layers[index + 1].adjustment?.scope === 'clipped'
    )
      clipped.push(doc.layers[++index]);
    if (!layer.visible || layer.opacity === 0) continue;
    if (layer.kind === 'adjustment') {
      if (layer.adjustment?.scope === 'clipped') continue; // No base below this orphaned clip.
      await adjustCanvas(c, layer, sx, sy, options);
      for (const adjustment of clipped) await adjustCanvas(c, adjustment, sx, sy, options);
    } else {
      const image = await cachedSurface(layer);
      checkRender(options);
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend === 'normal' ? 'source-over' : layer.blend;
      if (clipped.length) {
        const isolated = surface(c.width, c.height);
        drawPositioned(isolated.getContext('2d')!, image, layer, sx, sy);
        for (const adjustment of clipped) await adjustCanvas(isolated, adjustment, sx, sy, options);
        ctx.drawImage(isolated, 0, 0);
      } else drawPositioned(ctx, image, layer, sx, sy);
      ctx.restore();
    }
  }
  // JPEG paper is added AFTER adjustments, so transparent pixels never become tinted paper.
  if (white) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  }
  return c;
}
export function localPoint(p: Point, layer: Layer): Point {
  const a = (-layer.rotation * Math.PI) / 180,
    dx = p.x - layer.x - layer.width / 2,
    dy = p.y - layer.y - layer.height / 2;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + layer.width / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + layer.height / 2,
  };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const dataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
export function validateDoc(value: unknown): StudioDoc {
  const d = value as StudioDoc;
  const number = (n: unknown, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (
    !d ||
    d.format !== 'layer-studio' ||
    ![1, 2].includes(d.version) ||
    typeof d.name !== 'string' ||
    !number(d.width, 1, 4096) ||
    !number(d.height, 1, 4096) ||
    !Array.isArray(d.layers) ||
    d.layers.length > 50
  )
    throw Error('지원하는 Layer Studio 프로젝트가 아닙니다.');
  const ids = new Set<string>();
  for (const l of d.layers) {
    if (
      !l ||
      typeof l.id !== 'string' ||
      ids.has(l.id) ||
      typeof l.name !== 'string' ||
      !['image', 'text', 'paint', 'adjustment'].includes(l.kind) ||
      typeof l.text !== 'string' ||
      l.text.length > 10000 ||
      typeof l.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(l.color) ||
      !number(l.width, 1, 4096) ||
      !number(l.height, 1, 4096) ||
      !number(l.x, -20000, 20000) ||
      !number(l.y, -20000, 20000) ||
      !number(l.rotation, -360, 360) ||
      !number(l.opacity, 0, 1) ||
      !number(l.fontSize, 1, 1000) ||
      !number(l.brightness, 0, 200) ||
      !number(l.contrast, 0, 200) ||
      !number(l.saturation, 0, 200) ||
      !['normal', 'multiply', 'screen', 'overlay'].includes(l.blend) ||
      typeof l.visible !== 'boolean' ||
      typeof l.locked !== 'boolean' ||
      (l.src && !/^data:image\/(png|jpeg|webp);base64,/.test(l.src)) ||
      !Array.isArray(l.strokes) ||
      l.strokes.length > 10000
    )
      throw Error('프로젝트 레이어 데이터가 올바르지 않습니다.');
    ids.add(l.id);
    if (
      l.gaussian &&
      (l.kind === 'adjustment' ||
        !number(l.gaussian.radius, 0, 50) ||
        typeof l.gaussian.enabled !== 'boolean')
    )
      throw Error('흐림 필터 데이터가 올바르지 않습니다.');
    if (l.mask?.raster) {
      const r = l.mask.raster;
      if (
        !Number.isInteger(r.width) ||
        !Number.isInteger(r.height) ||
        !number(r.width, 1, 1024) ||
        !number(r.height, 1, 1024) ||
        !Array.isArray(r.alpha) ||
        r.alpha.length !== r.width * r.height ||
        r.alpha.some((a) => !Number.isInteger(a) || !number(a, 0, 255))
      )
        throw Error('배경 제거 마스크 데이터가 올바르지 않습니다.');
    }
    if (l.kind === 'adjustment') {
      if (d.version !== 2 || l.src || l.strokes.length)
        throw Error('조정 레이어는 버전 2 프로젝트를 사용합니다.');
      validateAdjustment(l.adjustment);
    } else if (l.adjustment !== undefined) throw Error('일반 레이어에 조정 데이터가 있습니다.');
    if (l.mask) {
      const m = l.mask;
      if (
        !number(m.width, 1, 4096) ||
        !number(m.height, 1, 4096) ||
        typeof m.enabled !== 'boolean' ||
        typeof m.inverted !== 'boolean' ||
        !Array.isArray(m.strokes) ||
        m.strokes.length > 10000 ||
        (m.polygon &&
          (!Array.isArray(m.polygon) ||
            m.polygon.length !== 4 ||
            m.polygon.some((p) => !number(p.x, -20000, 20000) || !number(p.y, -20000, 20000))))
      )
        throw Error('마스크 데이터가 올바르지 않습니다.');
    }
    for (const s of [...l.strokes, ...(l.mask?.strokes ?? [])])
      if (
        !number(s.size, 1, 300) ||
        typeof s.color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(s.color) ||
        typeof s.erase !== 'boolean' ||
        !Array.isArray(s.points) ||
        s.points.length > 100000 ||
        s.points.some((p) => !number(p.x, -20000, 20000) || !number(p.y, -20000, 20000))
      )
        throw Error('브러시 데이터가 올바르지 않습니다.');
  }
  return d;
}
export async function localSave(doc: StudioDoc) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('documents', 'readwrite');
    t.objectStore('documents').put(doc, 'current');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}
function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('photoshot-adjustments', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('documents');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function localLoad(): Promise<StudioDoc | null> {
  const db = await openDb();
  const result = await new Promise<StudioDoc | null>((resolve, reject) => {
    const r = db.transaction('documents').objectStore('documents').get('current');
    r.onsuccess = () => resolve(r.result ? validateDoc(r.result) : null);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return result;
}
