'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Stage from './stage';
import {
  ArrowDown,
  ArrowUp,
  Brush,
  Check,
  ChevronDown,
  Copy,
  Crop,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Hand,
  History,
  ImagePlus,
  Layers3,
  LockKeyhole,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Scan,
  Settings2,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
  UnlockKeyhole,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  blankDoc,
  composite,
  dataUrl,
  download,
  layerSurface,
  loadImage,
  localLoad,
  localPoint,
  localSave,
  makeLayer,
  maskSurface,
  surface,
  uid,
  validateDoc,
  type Layer,
  type Point,
  type StudioDoc,
} from './document';
import AdjustmentPanel from './adjustment-panel';
import { analyzeTones, type ToneAnalysis } from './tone-analysis';
import {
  adjustmentTypes,
  definitions,
  makeAdjustment,
  type Adjustment,
  type AdjustmentType,
} from './adjustments';
type Tool = 'move' | 'select' | 'crop' | 'brush' | 'erase' | 'text' | 'hand';
type Rect = { x: number; y: number; width: number; height: number };
const tools = [
  { id: 'move', name: '이동', key: 'V', icon: MousePointer2 },
  { id: 'select', name: '사각형 선택', key: 'M', icon: SquareDashed },
  { id: 'crop', name: '자르기', key: 'C', icon: Crop },
  { id: 'brush', name: '브러시', key: 'B', icon: Brush },
  { id: 'erase', name: '지우개', key: 'E', icon: Eraser },
  { id: 'text', name: '문자', key: 'T', icon: Type },
  { id: 'hand', name: '손 도구', key: 'H', icon: Hand },
] as const;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
function IconButton({
  label,
  onClick,
  children,
  disabled = false,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'active' : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export default function Editor() {
  const homeHref = 'https://slohero.com/photoshot/';
  const [doc, setDoc] = useState<StudioDoc>(blankDoc),
    docRef = useRef(doc);
  docRef.current = doc;
  const [maskTarget, setMaskTarget] = useState<string | null>(null),
    [maskRestore, setMaskRestore] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null),
    [toneAnalysis, setToneAnalysis] = useState<ToneAnalysis | null>(null),
    [analysisBusy, setAnalysisBusy] = useState(false);
  const [toneClipping, setToneClipping] = useState(false);
  const propertyScroll = useRef<HTMLDivElement>(null),
    analysisInput = useRef<StudioDoc | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [tool, setTool] = useState<Tool>('move'),
    [zoom, setZoom] = useState(0.65);
  const [color, setColor] = useState('#bfff50'),
    [brushSize, setBrushSize] = useState(24),
    [selection, setSelection] = useState<Rect | null>(null);
  const [toast, setToast] = useState(''),
    [saveStatus, setSaveStatus] = useState('이 기기에 자동 저장'),
    [ready, setReady] = useState(false);
  const [modal, setModal] = useState<'new' | 'export' | 'help' | 'adjustment' | null>(null),
    [newWidth, setNewWidth] = useState(1200),
    [newHeight, setNewHeight] = useState(800);
  const [exportFormat, setExportFormat] = useState('png'),
    [exportBusy, setExportBusy] = useState(false);
  const [panel, setPanel] = useState<'layers' | 'history'>('layers'),
    [panelOpen, setPanelOpen] = useState(false),
    [historyVersion, setHistoryVersion] = useState(0);
  const undoStack = useRef<{ doc: StudioDoc; label: string }[]>([]),
    redoStack = useRef<{ doc: StudioDoc; label: string }[]>([]);
  const imageInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    workspace = useRef<HTMLDivElement>(null),
    overlay = useRef<SVGSVGElement>(null);
  const gesture = useRef<{
    tool: Tool;
    start: Point;
    base: StudioDoc;
    layerId?: string;
    mask?: boolean;
    client: Point;
    scroll: Point;
  } | null>(null);
  const active = doc.layers.find((l) => l.id === selected),
    canEdit = !!active && !active.locked,
    currentTool = tools.find((t) => t.id === tool)!;
  const adjustmentEdit = useRef<{ doc: StudioDoc; id: string } | null>(null);
  const maskEditing = !!active?.mask && active.id === maskTarget;
  function addMask() {
    if (!active || !canEdit) return;
    update(
      active.id,
      {
        mask: {
          width: active.width,
          height: active.height,
          enabled: true,
          inverted: false,
          strokes: [],
        },
      },
      '레이어 마스크 추가',
    );
    setMaskTarget(active.id);
    setMaskRestore(false);
    setTool('brush');
  }
  const notify = useCallback((message: string) => setToast(message), []);
  const renderedDoc = compareId
    ? { ...doc, layers: doc.layers.map((l) => (l.id === compareId ? { ...l, visible: false } : l)) }
    : doc;
  let analysisSource: StudioDoc | null = null;
  if (
    active?.adjustment &&
    ['brightness', 'levels', 'curves', 'exposure'].includes(active.adjustment.type)
  ) {
    const index = doc.layers.findIndex((l) => l.id === active.id);
    let below = doc.layers.slice(0, index);
    if (active.adjustment.scope === 'clipped' && below.length) {
      let base = below.length - 1;
      while (base > 0 && below[base].adjustment?.scope === 'clipped') base--;
      if (below[base].kind !== 'adjustment') below = below.slice(base);
    }
    const previous = analysisInput.current;
    if (
      !previous ||
      previous.width !== doc.width ||
      previous.height !== doc.height ||
      previous.layers.length !== below.length ||
      below.some((l, i) => l !== previous.layers[i])
    )
      analysisInput.current = { ...doc, layers: below };
    analysisSource = analysisInput.current;
  }
  useEffect(() => {
    let live = true;
    setToneAnalysis(null);
    setAnalysisBusy(!!analysisSource);
    if (analysisSource)
      void composite(analysisSource, false, { maxEdge: 384, cancelled: () => !live })
        .then((c) => {
          if (live)
            setToneAnalysis(
              analyzeTones(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data),
            );
        })
        .catch(() => {})
        .finally(() => {
          if (live) setAnalysisBusy(false);
        });
    return () => {
      live = false;
    };
  }, [analysisSource]);
  useEffect(() => {
    setToneClipping(false);
    setCompareId(null);
    propertyScroll.current?.scrollTo({ top: 0 });
    if (active?.kind === 'adjustment') setPanelOpen(true);
  }, [selected]);
  function showProperties(id: string, mask = false) {
    endAdjustment();
    setSelected(id);
    setMaskTarget(mask ? id : null);
    setCompareId(null);
    setPanelOpen(true);
    setPanel('layers');
    if (mask) setTool('brush');
    requestAnimationFrame(() => propertyScroll.current?.scrollTo({ top: 0 }));
  }

  useEffect(() => {
    type ToolRegistry = {
      registerTool: (
        t: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: object;
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: ToolRegistry }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'inspect_layer_document',
            description:
              'Read the current canvas and layer properties without image bytes or making changes.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input) {
              if (
                !input ||
                typeof input !== 'object' ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw Error('Expected an empty object');
              const d = docRef.current;
              return {
                name: d.name,
                width: d.width,
                height: d.height,
                layers: d.layers.map(({ src, strokes, mask, ...l }) => ({
                  ...l,
                  strokeCount: strokes.length,
                  hasMask: !!mask,
                })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* unsupported experimental browser API */
    }
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role=dialog]');
    dialog?.querySelector<HTMLElement>('button:not(:disabled),input,select,textarea')?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialog) return;
      const list = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
        ),
      );
      const first = list[0],
        last = list.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [modal]);
  const commit = useCallback((next: StudioDoc, label: string, previous?: StudioDoc) => {
    const prev = previous ?? docRef.current;
    if (next === prev) return;
    undoStack.current.push({ doc: prev, label });
    if (undoStack.current.length > 30) undoStack.current.shift();
    redoStack.current = [];
    docRef.current = next;
    setDoc(next);
    setHistoryVersion((v) => v + 1);
  }, []);
  const update = useCallback(
    (id: string, changes: Partial<Layer>, label = '속성 변경') => {
      const d = docRef.current;
      commit(
        { ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...changes } : l)) },
        label,
      );
    },
    [commit],
  );
  function beginAdjustment() {
    if (active?.kind === 'adjustment' && !active.locked && !adjustmentEdit.current)
      adjustmentEdit.current = { doc: docRef.current, id: active.id };
  }
  function endAdjustment() {
    const edit = adjustmentEdit.current;
    if (!edit) return;
    adjustmentEdit.current = null;
    if (docRef.current !== edit.doc) commit(docRef.current, '조정 수치 변경', edit.doc);
  }
  function changeAdjustment(id: string, adjustment: Adjustment) {
    const d = docRef.current,
      l = d.layers.find((l) => l.id === id);
    if (!l || l.locked) return;
    const next = { ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, adjustment } : l)) };
    if (adjustmentEdit.current?.id === id) {
      docRef.current = next;
      setDoc(next);
    } else commit(next, `${definitions[adjustment.type].name} 변경`);
  }
  function addAdjustment(type: AdjustmentType) {
    const d = docRef.current;
    if (d.layers.length >= 50) {
      notify('최대 50개 레이어를 사용할 수 있습니다.');
      return;
    }
    const polygon =
      selection && selection.width > 0 && selection.height > 0
        ? [
            { x: selection.x, y: selection.y },
            { x: selection.x + selection.width, y: selection.y },
            { x: selection.x + selection.width, y: selection.y + selection.height },
            { x: selection.x, y: selection.y + selection.height },
          ]
        : undefined;
    const layer = makeLayer({
      kind: 'adjustment',
      name: definitions[type].name,
      width: d.width,
      height: d.height,
      adjustment: makeAdjustment(type),
      mask: {
        width: d.width,
        height: d.height,
        enabled: true,
        inverted: false,
        strokes: [],
        ...(polygon ? { polygon } : {}),
      },
    });
    const index = d.layers.findIndex((l) => l.id === selected),
      layers = [...d.layers];
    layers.splice(index < 0 ? layers.length : index + 1, 0, layer);
    commit({ ...d, version: 2, layers }, `${definitions[type].name} 조정 레이어 추가`);
    setSelected(layer.id);
    setMaskTarget(null);
    setSelection(null);
    setTool('move');
    setPanel('layers');
    setPanelOpen(true);
    setModal(null);
  }
  function undo() {
    const item = undoStack.current.pop();
    if (!item) return;
    redoStack.current.push({ doc: docRef.current, label: item.label });
    docRef.current = item.doc;
    setDoc(item.doc);
    setSelection(null);
    setHistoryVersion((v) => v + 1);
  }
  function redo() {
    const item = redoStack.current.pop();
    if (!item) return;
    undoStack.current.push({ doc: docRef.current, label: item.label });
    docRef.current = item.doc;
    setDoc(item.doc);
    setSelection(null);
    setHistoryVersion((v) => v + 1);
  }
  function fit(d = docRef.current) {
    const el = workspace.current;
    if (el)
      setZoom(
        clamp(
          Math.min((el.clientWidth - 100) / d.width, (el.clientHeight - 110) / d.height),
          0.08,
          1,
        ),
      );
  }
  useEffect(() => {
    let live = true;
    localLoad()
      .then((d) => {
        if (!live) return;
        if (d) {
          setDoc(d);
          docRef.current = d;
          setSelected(d.layers.at(-1)?.id ?? null);
        }
        setReady(true);
        setTimeout(() => fit(d ?? docRef.current), 30);
      })
      .catch(() => {
        setReady(true);
        notify('자동 복원을 사용할 수 없습니다. 프로젝트 파일로 저장해 주세요.');
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaveStatus('저장 중…');
    const t = setTimeout(() => {
      localSave(doc)
        .then(() => setSaveStatus('이 기기에 저장됨'))
        .catch(() => setSaveStatus('자동 저장 실패 · 파일로 저장해 주세요'));
    }, 900);
    return () => clearTimeout(t);
  }, [doc, ready]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.querySelector('[data-tutorial-dialog]')) return;
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (modal) {
        if (e.key === 'Escape') setModal(null);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveProject();
        }
        if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          imageInput.current?.click();
        }
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicate();
        }
        return;
      }
      const found = tools.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (found) {
        setTool(found.id);
        setSelection(null);
      }
      if (e.key === 'Escape') {
        setSelection(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      }
      if (e.key === '0') fit();
      if (e.key === '+' || e.key === '=') setZoom((z) => clamp(z * 1.2, 0.08, 3));
      if (e.key === '-') setZoom((z) => clamp(z / 1.2, 0.08, 3));
      if (
        active &&
        active.kind !== 'adjustment' &&
        !active.locked &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        update(
          active.id,
          {
            x: active.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
            y: active.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
          },
          '레이어 이동',
        );
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  async function importFiles(files: FileList | File[] | null) {
    if (!files) return;
    try {
      const d = docRef.current;
      if (d.layers.length + files.length > 50)
        throw Error('최대 50개 레이어를 사용할 수 있습니다.');
      const added: Layer[] = [];
      let w = d.width,
        h = d.height;
      for (const file of Array.from(files)) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
          throw Error('PNG, JPG, WebP 이미지를 선택해 주세요.');
        if (file.size > 25 * 1024 * 1024)
          throw Error('이미지는 한 장당 25MB 이하로 열 수 있습니다.');
        const src = await dataUrl(file),
          img = await loadImage(src);
        const ratio = Math.min(1, 4096 / img.width, 4096 / img.height);
        const c = surface(img.width * ratio, img.height * ratio);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        if (!d.layers.length && !added.length) {
          w = c.width;
          h = c.height;
        }
        added.push(
          makeLayer({
            kind: 'image',
            name: file.name.replace(/\.[^.]+$/, ''),
            src: c.toDataURL('image/png'),
            width: c.width,
            height: c.height,
            x: Math.round((w - c.width) / 2),
            y: Math.round((h - c.height) / 2),
          }),
        );
      }
      if (!added.length) return;
      const next = {
        ...d,
        width: w,
        height: h,
        name: d.layers.length ? d.name : added[0].name,
        layers: [...d.layers, ...added],
      };
      commit(next, '이미지 열기');
      setSelected(added.at(-1)!.id);
      setTool('move');
      setTimeout(() => fit(next), 0);
      notify(`${added.length}개 이미지를 열었습니다.`);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function addLayer(layer: Layer, label: string) {
    const d = docRef.current;
    if (d.layers.length >= 50) {
      notify('최대 50개 레이어를 사용할 수 있습니다.');
      return;
    }
    commit({ ...d, layers: [...d.layers, layer] }, label);
    setSelected(layer.id);
  }
  function addPaint() {
    addLayer(
      makeLayer({
        name: `빈 레이어 ${doc.layers.length + 1}`,
        width: doc.width,
        height: doc.height,
      }),
      '레이어 추가',
    );
  }
  function duplicate() {
    if (!active) return;
    if (doc.layers.length >= 50) {
      notify('최대 50개 레이어를 사용할 수 있습니다.');
      return;
    }
    const layer = {
      ...structuredClone(active),
      id: uid(),
      name: `${active.name} 복사`,
      x: active.x + (active.kind === 'adjustment' ? 0 : 20),
      y: active.y + (active.kind === 'adjustment' ? 0 : 20),
      locked: false,
    };
    const layers = [...doc.layers];
    layers.splice(layers.findIndex((l) => l.id === active.id) + 1, 0, layer);
    commit({ ...doc, layers }, '레이어 복제');
    setSelected(layer.id);
    setMaskTarget(null);
  }
  function remove() {
    if (!canEdit) return;
    commit({ ...doc, layers: doc.layers.filter((l) => l.id !== active.id) }, '레이어 삭제');
    setSelected(null);
  }
  function reorder(delta: number) {
    if (!active || active.locked) return;
    const layers = [...doc.layers],
      i = layers.findIndex((l) => l.id === active.id),
      j = clamp(i + delta, 0, layers.length - 1);
    if (i === j) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    commit({ ...doc, layers }, '레이어 순서 변경');
  }
  function saveProject() {
    download(
      new Blob([JSON.stringify(docRef.current)], { type: 'application/json' }),
      `${docRef.current.name}.layerstudio`,
    );
    notify('프로젝트 파일을 저장했습니다.');
  }
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) throw Error('프로젝트 파일은 100MB 이하만 지원합니다.');
      const next = validateDoc(JSON.parse(await file.text()));
      await Promise.all(next.layers.filter((l) => l.src).map((l) => loadImage(l.src!)));
      commit(next, '프로젝트 열기');
      setSelected(next.layers.at(-1)?.id ?? null);
      setSelection(null);
      setTimeout(() => fit(next), 0);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function exportImage() {
    setExportBusy(true);
    try {
      const c = await composite(doc, exportFormat === 'jpeg');
      const blob = await new Promise<Blob | null>((r) =>
        c.toBlob(r, `image/${exportFormat}`, 0.94),
      );
      if (!blob) throw Error('이미지를 내보내지 못했습니다.');
      download(blob, `${doc.name}.${exportFormat === 'jpeg' ? 'jpg' : 'png'}`);
      setModal(null);
      notify('이미지를 내보냈습니다.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  }
  function pos(e: React.PointerEvent): Point {
    const b = overlay.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) * doc.width) / b.width,
      y: ((e.clientY - b.top) * doc.height) / b.height,
    };
  }
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e),
      base = docRef.current;
    gesture.current = {
      tool,
      start: p,
      base,
      client: { x: e.clientX, y: e.clientY },
      scroll: { x: workspace.current!.scrollLeft, y: workspace.current!.scrollTop },
    };
    if (tool === 'text') {
      addLayer(
        makeLayer({
          kind: 'text',
          name: '새 텍스트',
          text: '여기에 입력하세요',
          fontSize: 80,
          color,
          width: Math.min(1000, doc.width),
          height: 220,
          x: p.x,
          y: p.y,
        }),
        '문자 추가',
      );
      setTool('move');
      gesture.current = null;
      return;
    }
    if (tool === 'select' || tool === 'crop') {
      setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
      return;
    }
    if (tool === 'hand') return;
    if (tool === 'move') {
      const hit = [...base.layers].reverse().find((l) => {
        if (!l.visible || l.kind === 'adjustment') return false;
        const q = localPoint(p, l);
        return q.x >= 0 && q.y >= 0 && q.x <= l.width && q.y <= l.height;
      });
      if (!hit) {
        setSelected(null);
        gesture.current = null;
        return;
      }
      setSelected(hit.id);
      if (hit.locked) {
        gesture.current = null;
        notify('잠긴 레이어입니다. 잠금을 해제해 주세요.');
        return;
      }
      gesture.current.layerId = hit.id;
    }
    if (tool === 'brush' || tool === 'erase') {
      if (!active || active.locked) {
        gesture.current = null;
        notify('그릴 레이어를 선택하거나 새 레이어를 추가해 주세요.');
        return;
      }
      if (active.kind === 'adjustment' && !maskEditing) {
        gesture.current = null;
        notify('조정 레이어의 마스크 썸네일을 선택해 그려 주세요.');
        return;
      }
      gesture.current.layerId = active.id;
      gesture.current.mask = maskEditing;
      if (maskEditing && !active.mask!.enabled) {
        gesture.current = null;
        notify('마스크를 먼저 사용으로 전환해 주세요.');
        return;
      }
      const q = localPoint(p, active);
      const next = {
        ...base,
        layers: base.layers.map((l) => {
          if (l.id !== active.id) return l;
          if (maskEditing && l.mask) {
            const m = l.mask;
            return {
              ...l,
              mask: {
                ...m,
                strokes: [
                  ...m.strokes,
                  {
                    points: [{ x: (q.x * m.width) / l.width, y: (q.y * m.height) / l.height }],
                    size: clamp((brushSize * m.width) / l.width, 1, 300),
                    color: '#ffffff',
                    erase: !maskRestore !== m.inverted,
                  },
                ],
              },
            };
          }
          return {
            ...l,
            strokes: [
              ...l.strokes,
              { points: [q], size: brushSize, color, erase: tool === 'erase' },
            ],
          };
        }),
      };
      docRef.current = next;
      setDoc(next);
    }
  }
  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = pos(e);
    if (g.tool === 'hand') {
      workspace.current!.scrollLeft = g.scroll.x - (e.clientX - g.client.x);
      workspace.current!.scrollTop = g.scroll.y - (e.clientY - g.client.y);
      return;
    }
    if (g.tool === 'crop' || g.tool === 'select') {
      const x = clamp(Math.min(p.x, g.start.x), 0, doc.width),
        y = clamp(Math.min(p.y, g.start.y), 0, doc.height);
      setSelection({
        x,
        y,
        width: clamp(Math.max(p.x, g.start.x), 0, doc.width) - x,
        height: clamp(Math.max(p.y, g.start.y), 0, doc.height) - y,
      });
      return;
    }
    let next = docRef.current;
    if (g.tool === 'move') {
      next = {
        ...g.base,
        layers: g.base.layers.map((l) =>
          l.id === g.layerId
            ? { ...l, x: Math.round(l.x + p.x - g.start.x), y: Math.round(l.y + p.y - g.start.y) }
            : l,
        ),
      };
    }
    if (g.tool === 'brush' || g.tool === 'erase') {
      next = {
        ...next,
        layers: next.layers.map((l) => {
          if (l.id !== g.layerId) return l;
          const q = localPoint(p, l);
          if (g.mask && l.mask) {
            const m = l.mask;
            return {
              ...l,
              mask: {
                ...m,
                strokes: m.strokes.map((s, i) =>
                  i === m.strokes.length - 1
                    ? {
                        ...s,
                        points: [
                          ...s.points,
                          { x: (q.x * m.width) / l.width, y: (q.y * m.height) / l.height },
                        ],
                      }
                    : s,
                ),
              },
            };
          }
          return {
            ...l,
            strokes: l.strokes.map((s, i) =>
              i === l.strokes.length - 1 ? { ...s, points: [...s.points, q] } : s,
            ),
          };
        }),
      };
    }
    docRef.current = next;
    setDoc(next);
  }
  function pointerUp() {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (['move', 'brush', 'erase'].includes(g.tool))
      commit(
        docRef.current,
        g.mask
          ? '마스크 브러시'
          : g.tool === 'move'
            ? '레이어 이동'
            : g.tool === 'brush'
              ? '브러시'
              : '지우개',
        g.base,
      );
  }
  async function applySelection() {
    if (!selection || selection.width < 1 || selection.height < 1) return;
    const r = {
      x: Math.round(selection.x),
      y: Math.round(selection.y),
      width: Math.max(1, Math.round(selection.width)),
      height: Math.max(1, Math.round(selection.height)),
    };
    if (tool === 'crop') {
      commit(
        {
          ...doc,
          width: r.width,
          height: r.height,
          layers: doc.layers.map((l) => ({ ...l, x: l.x - r.x, y: l.y - r.y })),
        },
        '캔버스 자르기',
      );
      setTimeout(() => fit(), 0);
    } else if (active && !active.locked) {
      const polygon = [
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x + r.width, y: r.y + r.height },
        { x: r.x, y: r.y + r.height },
      ].map((p) => localPoint(p, active));
      update(
        active.id,
        {
          mask: {
            width: active.width,
            height: active.height,
            enabled: true,
            inverted: false,
            strokes: [],
            polygon,
          },
        },
        '선택 영역으로 마스크 만들기',
      );
      setMaskTarget(active.id);
    }

    setSelection(null);
    setTool('move');
  }
  return (
    <main className="studio">
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".layerstudio,.json"
        hidden
        onChange={(e) => {
          void openProject(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <header className="topbar">
        <a href={homeHref} className="brand" aria-label="Photoshot 홈">
          <span className="brandmark">
            <Layers3 size={20} />
          </span>
          <strong>
            photo<span>shot</span>
          </strong>
          <small>ALPHA</small>
        </a>
        <nav className="file-actions">
          <button onClick={() => setModal('new')}>새 작업</button>
          <button onClick={() => imageInput.current?.click()}>이미지 열기</button>
          <button onClick={() => projectInput.current?.click()}>프로젝트 열기</button>
        </nav>
        <div className="top-spacer" />
        <span className="local-badge">
          <span />
          로컬 편집
        </span>
        <IconButton label="사용법과 단축키" onClick={() => setModal('help')}>
          <span>?</span>
        </IconButton>
        <button className="save-button" onClick={saveProject}>
          <Save size={15} />
          <span>프로젝트 저장</span>
        </button>
        <button
          className="primary"
          onClick={() => setModal('export')}
          disabled={!doc.layers.length}
        >
          <Download size={16} />
          내보내기
        </button>
      </header>
      <div className="optionsbar">
        <div className="tool-title">
          <currentTool.icon size={17} />
          <span>{currentTool.name}</span>
        </div>
        <span className="divider" />
        {tool === 'brush' || tool === 'erase' ? (
          <>
            <label className="inline-label">
              크기{' '}
              <input
                type="range"
                min="1"
                max="200"
                value={brushSize}
                onChange={(e) => setBrushSize(+e.target.value)}
              />
              <span>{brushSize}px</span>
            </label>
            {maskEditing ? (
              <div className="mask-brush-modes">
                <button
                  className={!maskRestore ? 'chosen' : ''}
                  onClick={() => setMaskRestore(false)}
                >
                  ● 숨기기
                </button>
                <button
                  className={maskRestore ? 'chosen' : ''}
                  onClick={() => setMaskRestore(true)}
                >
                  ○ 복원
                </button>
                <span>마스크 편집 중</span>
              </div>
            ) : (
              <input
                aria-label="브러시 색상"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            )}
          </>
        ) : tool === 'crop' || tool === 'select' ? (
          <>
            <span className="muted">드래그하여 영역 선택</span>
            <button
              className="subtle"
              disabled={!selection || selection.width < 1 || (tool === 'select' && !canEdit)}
              onClick={() => void applySelection()}
            >
              <Check size={14} />
              {tool === 'crop' ? '자르기 적용' : '선택 영역으로 마스크'}
            </button>
            <button className="plain" onClick={() => setSelection(null)}>
              해제
            </button>
          </>
        ) : (
          <>
            <span className="muted option-help">
              {tool === 'move'
                ? '레이어 선택 후 드래그 · 방향키로 미세 이동'
                : tool === 'text'
                  ? '캔버스를 클릭하여 문자 추가'
                  : '드래그하여 작업 영역 이동'}
            </span>
          </>
        )}
        <div className="top-spacer" />
        <IconButton label="실행 취소 (Ctrl+Z)" onClick={undo} disabled={!undoStack.current.length}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton
          label="다시 실행 (Ctrl+Shift+Z)"
          onClick={redo}
          disabled={!redoStack.current.length}
        >
          <Redo2 size={17} />
        </IconButton>
        <span className="divider" />
        <button
          className="adjustment-toolbar-add"
          onClick={() => setModal('adjustment')}
          disabled={doc.layers.length >= 50}
        >
          <SlidersHorizontal size={16} />
          조정 추가
        </button>
        <button
          className={`panel-toggle ${panelOpen ? 'active' : ''}`}
          aria-label="레이어 패널 표시"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <Layers3 size={17} />
          <span>레이어</span>
        </button>
      </div>
      <div className="editor-body">
        <aside className="toolrail" aria-label="편집 도구">
          {tools.map((t) => (
            <IconButton
              key={t.id}
              label={`${t.name} (${t.key})`}
              active={tool === t.id}
              onClick={() => {
                setTool(t.id);
                setSelection(null);
              }}
            >
              <t.icon size={20} />
            </IconButton>
          ))}
          <span className="rail-line" />
          <IconButton label="이미지 추가" onClick={() => imageInput.current?.click()}>
            <ImagePlus size={20} />
          </IconButton>
          <label className="color-well" title="전경색">
            <input
              aria-label="전경색"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <div className="rail-bottom">
            <IconButton label="화면에 맞추기 (0)" onClick={() => fit()}>
              <Scan size={20} />
            </IconButton>
          </div>
        </aside>
        <section className="center">
          <div className="document-tab">
            <span className="tab-active">
              <span className="file-dot" />
              <input
                aria-label="프로젝트 이름"
                value={doc.name}
                maxLength={80}
                onChange={(e) => commit({ ...doc, name: e.target.value }, '이름 변경')}
              />
              <span className="tab-size">{Math.round(zoom * 100)}%</span>
            </span>
            <span className="document-mode">RGB / 8비트</span>
          </div>
          <div
            className="workspace"
            ref={workspace}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void importFiles(e.dataTransfer.files);
            }}
          >
            <div className="ruler-top" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <span key={i}>{i * 100}</span>
              ))}
            </div>
            <div className="ruler-left" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i}>{i * 100}</span>
              ))}
            </div>
            {doc.layers.length ? (
              <div
                className="canvas-space"
                style={{ minWidth: doc.width * zoom + 120, minHeight: doc.height * zoom + 120 }}
              >
                <div className="canvas-label">
                  {doc.name}
                  {compareId && <b className="compare-badge">선택한 조정 적용 전</b>}
                  <span>
                    {doc.width} × {doc.height}
                  </span>
                </div>
                <div
                  className="canvas-frame checker"
                  style={{ width: doc.width * zoom, height: doc.height * zoom }}
                >
                  <Stage doc={renderedDoc} onError={notify} clipping={toneClipping} />
                  <svg
                    ref={overlay}
                    viewBox={`0 0 ${doc.width} ${doc.height}`}
                    className={`canvas-overlay cursor-${tool}`}
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={() => {
                      if (gesture.current) {
                        setDoc(gesture.current.base);
                        docRef.current = gesture.current.base;
                        gesture.current = null;
                      }
                    }}
                  >
                    {active &&
                      active.kind !== 'adjustment' &&
                      active.visible &&
                      tool === 'move' && (
                        <g
                          transform={`rotate(${active.rotation} ${active.x + active.width / 2} ${active.y + active.height / 2})`}
                          pointerEvents="none"
                        >
                          <rect
                            x={active.x}
                            y={active.y}
                            width={active.width}
                            height={active.height}
                            fill="none"
                            stroke={active.locked ? '#aaa' : '#bdff56'}
                            strokeWidth={1 / zoom}
                          />
                          {[
                            [0, 0],
                            [1, 0],
                            [0, 1],
                            [1, 1],
                          ].map(([x, y], i) => (
                            <rect
                              key={i}
                              x={active.x + x * active.width - 3 / zoom}
                              y={active.y + y * active.height - 3 / zoom}
                              width={6 / zoom}
                              height={6 / zoom}
                              fill="#20241b"
                              stroke="#bdff56"
                              strokeWidth={1 / zoom}
                            />
                          ))}
                        </g>
                      )}
                    {selection && (
                      <rect
                        {...selection}
                        fill="#bfff5015"
                        stroke="#fff"
                        strokeWidth={1.5 / zoom}
                        strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                        pointerEvents="none"
                      />
                    )}
                  </svg>
                </div>
              </div>
            ) : (
              <div className="empty-workspace">
                <div className="empty-icon">
                  <Layers3 size={34} />
                </div>
                <span className="eyebrow">YOUR NEXT LAYER STARTS HERE</span>
                <h1>
                  한 장의 이미지,
                  <br />
                  새로운 가능성.
                </h1>
                <p>이미지를 끌어다 놓고 편집을 시작하세요.</p>
                <button className="primary large" onClick={() => imageInput.current?.click()}>
                  <FolderOpen size={18} />
                  이미지 열기
                </button>
                <button className="empty-new" onClick={() => setModal('new')}>
                  <Plus size={14} />빈 캔버스로 시작
                </button>
                <span className="file-types">
                  PNG · JPG · WEBP
                  <span />
                  최대 25MB
                </span>
                <div className="privacy-note">
                  <LockKeyhole size={13} />
                  일반 편집은 브라우저 안에서 처리됩니다.
                </div>
              </div>
            )}
          </div>
          <footer className="statusbar">
            <span className="save-state">
              <Check size={12} />
              {saveStatus}
            </span>
            <span className="status-dim">
              {doc.width} × {doc.height}px
            </span>
            <div className="top-spacer" />
            <IconButton label="축소" onClick={() => setZoom((z) => clamp(z / 1.2, 0.08, 3))}>
              <Minus size={14} />
            </IconButton>
            <button className="zoom-value" onClick={() => fit()}>
              {Math.round(zoom * 100)}%<ChevronDown size={12} />
            </button>
            <IconButton label="확대" onClick={() => setZoom((z) => clamp(z * 1.2, 0.08, 3))}>
              <Plus size={14} />
            </IconButton>
            <IconButton label="화면에 맞추기" onClick={() => fit()}>
              <Maximize size={14} />
            </IconButton>
          </footer>
        </section>
        <aside className={`properties ${panelOpen ? 'mobile-open' : ''}`}>
          <div className="property-header">
            <SlidersHorizontal size={15} />
            <strong>속성</strong>
            <span>
              {active
                ? active.kind === 'adjustment'
                  ? '조정'
                  : active.kind === 'image'
                    ? '이미지'
                    : active.kind === 'text'
                      ? '문자'
                      : '픽셀'
                : '문서'}
            </span>
            <button
              className="property-close"
              aria-label="속성 패널 닫기"
              onClick={() => setPanelOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {active?.kind === 'adjustment' && (
            <div className="property-mode-tabs" role="tablist" aria-label="속성 편집 대상">
              <button
                role="tab"
                aria-selected={!maskEditing}
                onClick={() => showProperties(active.id)}
              >
                <SlidersHorizontal size={14} />
                조정
              </button>
              <button
                role="tab"
                aria-selected={maskEditing}
                disabled={!active.mask && !canEdit}
                onClick={() => {
                  if (!active.mask) addMask();
                  else showProperties(active.id, true);
                }}
              >
                <SquareDashed size={14} />
                마스크
              </button>
            </div>
          )}
          <div className="property-scroll" ref={propertyScroll}>
            {active?.kind === 'adjustment' && maskEditing ? null : active?.kind === 'adjustment' &&
              active.adjustment ? (
              <>
                <label className="curve-options">
                  <input
                    type="checkbox"
                    checked={toneClipping}
                    onChange={(e) => setToneClipping(e.target.checked)}
                  />
                  클리핑 보기 · 파랑: 검정 / 빨강: 흰색
                </label>
                <AdjustmentPanel
                  key={active.id}
                  value={active.adjustment}
                  disabled={!canEdit}
                  onChange={(a) => changeAdjustment(active.id, a)}
                  onBegin={beginAdjustment}
                  onEnd={endAdjustment}
                  onError={notify}
                  analysis={toneAnalysis}
                  analysisBusy={analysisBusy}
                  comparing={compareId === active.id}
                  onCompare={(pressed) => setCompareId(pressed ? active.id : null)}
                />
              </>
            ) : active ? (
              <>
                <div className="section-label">
                  변형 {active.locked && <LockKeyhole size={13} />}
                </div>
                <div className="number-grid">
                  {(
                    [
                      { k: 'x', label: 'X', min: -20000, max: 20000 },
                      { k: 'y', label: 'Y', min: -20000, max: 20000 },
                      { k: 'width', label: 'W', min: 1, max: 4096 },
                      { k: 'height', label: 'H', min: 1, max: 4096 },
                      { k: 'rotation', label: '회전', min: -360, max: 360 },
                    ] as const
                  ).map((f) => (
                    <label key={f.k}>
                      <span>{f.label}</span>
                      <input
                        aria-label={
                          f.label === 'W'
                            ? '레이어 너비'
                            : f.label === 'H'
                              ? '레이어 높이'
                              : f.label
                        }
                        disabled={!canEdit}
                        type="number"
                        min={f.min}
                        max={f.max}
                        value={Math.round(active[f.k])}
                        onChange={(e) => {
                          if (e.target.value !== '')
                            update(active.id, { [f.k]: clamp(+e.target.value, f.min, f.max) });
                        }}
                      />
                      <small>{f.k === 'rotation' ? '°' : 'px'}</small>
                    </label>
                  ))}
                </div>
                {active.kind === 'text' && (
                  <div className="text-properties">
                    <div className="section-label">문자</div>
                    <textarea
                      aria-label="문자 내용"
                      value={active.text}
                      disabled={!canEdit}
                      onChange={(e) => update(active.id, { text: e.target.value }, '문자 편집')}
                    />
                    <label className="inline-label">
                      크기
                      <input
                        aria-label="글자 크기"
                        type="number"
                        min="1"
                        max="1000"
                        value={active.fontSize}
                        disabled={!canEdit}
                        onChange={(e) =>
                          update(active.id, { fontSize: clamp(+e.target.value, 1, 1000) })
                        }
                      />
                      <input
                        aria-label="문자 색상"
                        type="color"
                        value={active.color}
                        disabled={!canEdit}
                        onChange={(e) => update(active.id, { color: e.target.value })}
                      />
                    </label>
                  </div>
                )}
                <div className="section-label adjustments-title">
                  색상 조절
                  <IconButton
                    label="색상 조절 초기화"
                    onClick={() =>
                      update(active.id, { brightness: 100, contrast: 100, saturation: 100 })
                    }
                    disabled={!canEdit}
                  >
                    <Undo2 size={13} />
                  </IconButton>
                </div>
                {(
                  [
                    { k: 'brightness', label: '밝기' },
                    { k: 'contrast', label: '대비' },
                    { k: 'saturation', label: '채도' },
                  ] as const
                ).map((f) => (
                  <label className="slider-row" key={f.k}>
                    <span>
                      {f.label}
                      <output>{active[f.k] - 100}</output>
                    </span>
                    <input
                      aria-label={f.label}
                      type="range"
                      min="0"
                      max="200"
                      value={active[f.k]}
                      disabled={!canEdit}
                      onChange={(e) => update(active.id, { [f.k]: +e.target.value }, '색상 조절')}
                    />
                  </label>
                ))}
              </>
            ) : (
              <div className="document-props">
                <div className="section-label">캔버스</div>
                <div className="number-grid">
                  <label>
                    <span>W</span>
                    <b>{doc.width}</b>
                    <small>px</small>
                  </label>
                  <label>
                    <span>H</span>
                    <b>{doc.height}</b>
                    <small>px</small>
                  </label>
                </div>
                <p>
                  레이어를 선택하면 위치와
                  <br />
                  색상을 조절할 수 있습니다.
                </p>
              </div>
            )}
            {active && (active.kind !== 'adjustment' || maskEditing) && (
              <section className="mask-controls">
                <div className="section-label">레이어 마스크</div>
                {active.mask ? (
                  <>
                    <div className="mask-actions">
                      <button
                        disabled={!canEdit}
                        onClick={() => {
                          setMaskTarget(active.id);
                          setTool('brush');
                        }}
                      >
                        마스크 편집
                      </button>
                      <button onClick={() => showProperties(active.id)}>원본 편집</button>
                      <button
                        disabled={!canEdit}
                        onClick={() =>
                          update(
                            active.id,
                            { mask: { ...active.mask!, enabled: !active.mask!.enabled } },
                            '마스크 사용 전환',
                          )
                        }
                      >
                        {active.mask.enabled ? '마스크 끄기' : '마스크 켜기'}
                      </button>
                      <button
                        disabled={!canEdit}
                        onClick={() =>
                          update(
                            active.id,
                            { mask: { ...active.mask!, inverted: !active.mask!.inverted } },
                            '마스크 반전',
                          )
                        }
                      >
                        반전
                      </button>
                      <button
                        disabled={!canEdit}
                        onClick={() => {
                          update(active.id, { mask: undefined }, '마스크 삭제');
                          setMaskTarget(null);
                        }}
                      >
                        마스크 삭제
                      </button>
                    </div>
                    <p>검정은 숨기고 흰색은 보여줍니다. 원본은 그대로 유지됩니다.</p>
                  </>
                ) : (
                  <button className="subtle" disabled={!canEdit} onClick={addMask}>
                    ＋ 레이어 마스크 추가
                  </button>
                )}
              </section>
            )}
          </div>
          <button
            className="adjustment-add"
            onClick={() => setModal('adjustment')}
            disabled={doc.layers.length >= 50}
          >
            <SlidersHorizontal size={15} />
            조정 레이어 추가
          </button>
          <div className="layers-tabs">
            <button
              className={panel === 'layers' ? 'selected' : ''}
              onClick={() => setPanel('layers')}
            >
              레이어 <span>{doc.layers.length}</span>
            </button>
            <button
              className={panel === 'history' ? 'selected' : ''}
              onClick={() => setPanel('history')}
            >
              작업 기록
            </button>
          </div>
          {panel === 'layers' ? (
            <>
              <div className="blend-controls">
                <select
                  aria-label="혼합 모드"
                  value={active?.blend ?? 'normal'}
                  disabled={!canEdit}
                  onChange={(e) =>
                    active && update(active.id, { blend: e.target.value as Layer['blend'] })
                  }
                >
                  <option value="normal">표준</option>
                  <option value="multiply">곱하기</option>
                  <option value="screen">스크린</option>
                  <option value="overlay">오버레이</option>
                </select>
                <label>
                  불투명도
                  <input
                    aria-label="불투명도"
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round((active?.opacity ?? 1) * 100)}
                    disabled={!canEdit}
                    onChange={(e) =>
                      active && update(active.id, { opacity: clamp(+e.target.value, 0, 100) / 100 })
                    }
                  />
                  <span>%</span>
                </label>
              </div>
              <div className="layer-list">
                {[...doc.layers].reverse().map((l) => (
                  <div
                    className={`layer-row ${l.id === selected ? 'selected' : ''} ${!l.visible ? 'hidden-layer' : ''} ${l.adjustment?.scope === 'clipped' ? 'clipped-adjustment' : ''}`}
                    key={l.id}
                    onClick={() => showProperties(l.id)}
                  >
                    <IconButton
                      label={`${l.name} ${l.visible ? '숨기기' : '표시'}`}
                      onClick={() => update(l.id, { visible: !l.visible }, '레이어 표시 변경')}
                    >
                      {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </IconButton>
                    <button
                      type="button"
                      className={`layer-thumb checker ${l.kind === 'adjustment' ? 'adjustment-thumb' : ''}`}
                      aria-label={`${l.name} ${l.kind === 'adjustment' ? '조정 속성 열기' : '속성 열기'}`}
                      title={
                        l.adjustment
                          ? `${definitions[l.adjustment.type].name} · 클릭하여 조정`
                          : l.name
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        showProperties(l.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        showProperties(l.id);
                      }}
                    >
                      {l.kind === 'adjustment' ? (
                        <SlidersHorizontal size={17} />
                      ) : l.src ? (
                        <img src={l.src} alt="" />
                      ) : l.kind === 'text' ? (
                        <Type size={17} />
                      ) : (
                        <Brush size={16} />
                      )}
                    </button>
                    {l.mask && (
                      <button
                        aria-label={`${l.name} 마스크 편집`}
                        className={`mask-thumb ${maskTarget === l.id ? 'editing' : ''} ${!l.mask.enabled ? 'disabled-mask' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          showProperties(l.id, true);
                        }}
                      >
                        <MaskThumb mask={l.mask} />
                      </button>
                    )}
                    <input
                      aria-label={`레이어 이름 ${l.name}`}
                      value={l.name}
                      maxLength={80}
                      onChange={(e) => update(l.id, { name: e.target.value }, '레이어 이름 변경')}
                    />
                    <IconButton
                      label={`${l.name} ${l.locked ? '잠금 해제' : '잠금'}`}
                      onClick={() => update(l.id, { locked: !l.locked }, '레이어 잠금 변경')}
                    >
                      {l.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}
                    </IconButton>
                  </div>
                ))}
                {!doc.layers.length && (
                  <div className="empty-layers">
                    <Layers3 size={23} />
                    <p>아직 레이어가 없습니다.</p>
                    <span>이미지를 열거나 새 레이어를 추가하세요.</span>
                  </div>
                )}
              </div>
              <div className="layer-bottom">
                <IconButton label="새 레이어" onClick={addPaint}>
                  <Plus size={17} />
                </IconButton>
                <IconButton label="레이어 복제 (Ctrl+D)" onClick={duplicate} disabled={!active}>
                  <Copy size={15} />
                </IconButton>
                <IconButton label="레이어 위로" onClick={() => reorder(1)} disabled={!canEdit}>
                  <ArrowUp size={15} />
                </IconButton>
                <IconButton label="레이어 아래로" onClick={() => reorder(-1)} disabled={!canEdit}>
                  <ArrowDown size={15} />
                </IconButton>
                <div className="top-spacer" />
                <IconButton label="레이어 삭제" onClick={remove} disabled={!canEdit}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </>
          ) : (
            <div className="history-list" key={historyVersion}>
              <p>최대 30단계까지 되돌릴 수 있습니다.</p>
              {[...undoStack.current].reverse().map((h, i) => (
                <div key={i}>
                  <History size={14} />
                  {h.label}
                  {i === 0 && <span>최근</span>}
                </div>
              ))}
              {!undoStack.current.length && <p>편집을 시작하면 기록이 쌓입니다.</p>}
            </div>
          )}
        </aside>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
          <button aria-label="알림 닫기" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="modal-title">
                {modal === 'new'
                  ? '새 캔버스'
                  : modal === 'export'
                    ? '이미지 내보내기'
                    : modal === 'adjustment'
                      ? '조정 레이어 추가'
                      : 'Photoshot 사용법'}
              </h2>
              <IconButton label="창 닫기" onClick={() => setModal(null)}>
                <X size={20} />
              </IconButton>
            </div>
            {modal === 'new' && (
              <>
                <p>새 캔버스를 만듭니다. 현재 작업은 실행 취소로 복원할 수 있습니다.</p>
                <div className="presets">
                  {[
                    { name: '가로', w: 1200, h: 800 },
                    { name: '정사각형', w: 1080, h: 1080 },
                    { name: '세로', w: 1080, h: 1920 },
                  ].map((p) => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setNewWidth(p.w);
                        setNewHeight(p.h);
                      }}
                    >
                      <span className="preset-shape" style={{ aspectRatio: `${p.w}/${p.h}` }} />
                      {p.name}
                      <small>
                        {p.w} × {p.h}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="modal-fields">
                  <label>
                    너비
                    <input
                      type="number"
                      min="1"
                      max="4096"
                      value={newWidth}
                      onChange={(e) => setNewWidth(clamp(+e.target.value, 1, 4096))}
                    />
                  </label>
                  <label>
                    높이
                    <input
                      type="number"
                      min="1"
                      max="4096"
                      value={newHeight}
                      onChange={(e) => setNewHeight(clamp(+e.target.value, 1, 4096))}
                    />
                  </label>
                </div>
                <button
                  className="primary full"
                  onClick={() => {
                    const d = {
                      ...blankDoc(),
                      width: Math.round(newWidth),
                      height: Math.round(newHeight),
                      layers: [
                        makeLayer({
                          name: '레이어 1',
                          width: Math.round(newWidth),
                          height: Math.round(newHeight),
                        }),
                      ],
                    };
                    commit(d, '새 캔버스');
                    setSelected(d.layers[0].id);
                    setModal(null);
                    setTimeout(() => fit(d), 0);
                  }}
                >
                  캔버스 만들기
                </button>
              </>
            )}
            {modal === 'export' && (
              <>
                <p>현재 보이는 레이어를 한 장의 이미지로 저장합니다.</p>
                <div className="export-info">
                  <Layers3 size={25} />
                  <div>
                    <strong>{doc.name}</strong>
                    <span>
                      {doc.width} × {doc.height}px · {doc.layers.filter((l) => l.visible).length}개
                      레이어
                    </span>
                  </div>
                </div>
                <label className="field-label">
                  파일 형식
                  <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                    <option value="png">PNG · 투명 배경 유지</option>
                    <option value="jpeg">JPG · 흰색 배경</option>
                  </select>
                </label>
                <button
                  className="primary full"
                  disabled={exportBusy}
                  onClick={() => void exportImage()}
                >
                  <Download size={16} />
                  {exportBusy ? '내보내는 중…' : '다운로드'}
                </button>
                <button className="plain full" onClick={saveProject}>
                  레이어를 유지하려면 프로젝트 파일로 저장
                </button>
              </>
            )}
            {modal === 'adjustment' && (
              <>
                <p>
                  선택한 레이어 바로 위에 추가합니다. 수치를 언제든 바꾸고 마스크로 적용 범위를
                  조절하세요.
                </p>
                <div className="adjustment-menu">
                  {adjustmentTypes.map((type) => (
                    <button key={type} onClick={() => addAdjustment(type)}>
                      <strong>{definitions[type].name}</strong>
                      <small>{definitions[type].description}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === 'help' && (
              <>
                <p>
                  이미지를 열고 왼쪽에서 도구를 선택하세요. 오른쪽에서 레이어의 위치, 크기, 색상을
                  조절할 수 있습니다.
                </p>
                <div className="shortcut-list">
                  {[
                    ['Ctrl + T', '이미지 자유 변형'],
                    ['Enter / Esc', '변형·필터 적용 / 취소'],
                    ['V / M / C', '이동 / 선택 / 자르기'],
                    ['B / E / T', '브러시 / 지우개 / 문자'],
                    ['H / 0', '손 도구 / 화면에 맞춤'],
                    ['Ctrl + Z', '실행 취소'],
                    ['Ctrl + Shift + Z', '다시 실행'],
                    ['Ctrl + S', '프로젝트 저장'],
                    ['Ctrl + D', '레이어 복제'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <kbd>{k}</kbd>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
                <p>
                  마스크 추가 후 브러시의 숨기기·복원으로 편집하세요. 선택 도구(M)로 영역을 지정해
                  마스크를 만들 수도 있습니다. 원본 썸네일을 누르면 원본 편집으로 돌아갑니다.
                </p>
                <p>
                  조정 레이어 추가에서 색상·명암 보정을 선택하세요. 기본으로 아래 레이어 전체에
                  적용되며, 적용 대상을 클리핑으로 바꾸면 바로 아래 레이어만 조절합니다. 조정
                  썸네일은 수치 편집, 마스크 썸네일은 영역 편집입니다.
                </p>
                <p className="help-note">
                  작업은 이 브라우저에 자동 저장됩니다. 다른 기기에서 이어서 작업하려면 .layerstudio
                  파일을 저장해 주세요. 첫 버전은 RGB 8비트, 최대 4096px·50개 레이어를 지원합니다.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function MaskThumb({ mask }: { mask: NonNullable<Layer['mask']> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 32, 32);
    ctx.drawImage(maskSurface(mask, 32, 32), 0, 0);
  }, [mask]);
  return <canvas ref={ref} width={32} height={32} />;
}
