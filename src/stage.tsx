'use client';
import { useEffect, useRef } from 'react';
import { Application, Sprite, Texture } from 'pixi.js';
import 'pixi.js/advanced-blend-modes';
import { layerSurface, type StudioDoc } from './document';
export default function Stage({
  doc,
  onError,
}: {
  doc: StudioDoc;
  onError: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    app = useRef<Application | null>(null),
    revision = useRef(0),
    current = useRef(doc);
  current.current = doc;
  async function draw(a: Application, d: StudioDoc) {
    const r = ++revision.current;
    const entries = await Promise.all(
      d.layers.filter((l) => l.visible).map(async (l) => ({ l, canvas: await layerSurface(l) })),
    );
    if (r !== revision.current || app.current !== a) return;
    for (const old of a.stage.removeChildren()) old.destroy({ texture: true, textureSource: true });
    a.renderer.resize(d.width, d.height);
    for (const { l, canvas } of entries) {
      const s = new Sprite(Texture.from(canvas));
      s.anchor.set(0.5);
      s.position.set(l.x + l.width / 2, l.y + l.height / 2);
      s.rotation = (l.rotation * Math.PI) / 180;
      s.alpha = l.opacity;
      s.blendMode = l.blend;
      a.stage.addChild(s);
    }
    a.render();
  }
  useEffect(() => {
    let disposed = false;
    const a = new Application();
    a.init({
      width: current.current.width,
      height: current.current.height,
      backgroundAlpha: 0,
      antialias: true,
      preference: 'webgl',
      autoStart: false,
      resolution: 1,
    })
      .then(() => {
        if (disposed) {
          a.destroy(true, { children: true, texture: true, textureSource: true });
          return;
        }
        app.current = a;
        host.current?.appendChild(a.canvas);
        return draw(a, current.current);
      })
      .catch(() =>
        onError('그래픽 화면을 초기화하지 못했습니다. 브라우저의 하드웨어 가속을 확인해 주세요.'),
      );
    return () => {
      disposed = true;
      revision.current++;
      if (app.current === a) {
        app.current = null;
        a.destroy(true, { children: true, texture: true, textureSource: true });
      }
    };
  }, []);
  useEffect(() => {
    if (app.current)
      draw(app.current, doc).catch(() =>
        onError('레이어를 표시하지 못했습니다. 이미지를 다시 열어 주세요.'),
      );
  }, [doc]);
  return <div ref={host} className="pixi-stage" aria-label="이미지 미리보기" />;
}
