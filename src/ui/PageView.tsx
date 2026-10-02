import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnnotationLayer, TextLayer, type PDFPageProxy } from 'pdfjs-dist';
import type { AnyObject, PageEntry, Quad, Rect, SourceDoc, SourcePageData, TextEditOp } from '../core/types';
import { getPageProxy, getPageTextData } from '../core/registry';
import { DEFAULT_ANNOTATE_COLORS, HIGHLIGHT_COLORS, STAMPS, UNIT_TO_POINTS } from '../core/constants';
import { boundsOfPoints, toCssMatrix } from '../core/geometry';
import { uid } from '../core/utils';
import { useDoc } from '../state/store';
import { useUI } from '../state/ui';
import type { ToolId } from '../core/constants';
import { ObjectView } from './objects';
import {
  angleToCenter,
  handlesFor,
  intersectRects,
  objectMatrix,
  pdfToScreen,
  resizeBox,
  rotationFromPointer,
  screenToLocal,
  screenToPdf,
  type Box,
  type HandleId,
} from './transform';

type DragMode = 'none' | 'move' | 'resize' | 'rotate' | 'create' | 'pan' | 'marquee';

interface DragState {
  mode: DragMode;
  objectId?: string;
  handle?: HandleId;
  startScreen: { x: number; y: number };
  startPdf: { x: number; y: number };
  startBox?: Box;
  currentPdf?: { x: number; y: number };
  createdId?: string;
  origins?: Array<{ id: string; x: number; y: number }>;
  points?: { x: number; y: number }[];
  panStart?: { x: number; y: number; scrollLeft: number; scrollTop: number };
  startAngle?: number;
}

const CREATION_TOOLS: ToolId[] = [
  'highlight',
  'underline',
  'strike',
  'squiggly',
  'draw',
  'shape',
  'redact',
  'link',
  'measure',
  'text',
  'note',
  'stamp',
  'signature',
  'form-text',
  'form-checkbox',
  'form-radio',
  'form-dropdown',
  'form-button',
  'image',
  'eraser',
  'editText',
];

export interface PageViewProps {
  entry: PageEntry;
  index: number;
  source: SourceDoc;
}

export const PageView: React.FC<PageViewProps> = ({ entry, index, source }) => {
  const zoom = useUI((s) => s.zoom);
  const tool = useUI((s) => s.tool);
  const options = useUI((s) => s.toolOptions);
  const selection = useUI((s) => s.selection);
  const editingObject = useUI((s) => s.editingObject);
  const showAnnotations = useUI((s) => s.showAnnotations);
  const showTextLayer = useUI((s) => s.showTextLayer);

  const objectsById = useDoc((s) => s.objects);
  const objectIds = useDoc((s) => s.objectsByPage[entry.id]);
  const assets = useDoc((s) => s.assets);
  const addObject = useDoc((s) => s.addObject);
  const updateObject = useDoc((s) => s.updateObject);
  const updateObjects = useDoc((s) => s.updateObjects);
  const removeObjects = useDoc((s) => s.removeObjects);
  const addComment = useDoc((s) => s.addComment);
  const addTextEdit = useDoc((s) => s.addTextEdit);
  const setEditingObject = useUI((s) => s.setEditingObject);
  const setSelection = useUI((s) => s.setSelection);
  const setRightPanel = useUI((s) => s.setRightPanel);
  const setLeftPanel = useUI((s) => s.setLeftPanel);
  const toast = useUI((s) => s.toast);
  const openDialog = useUI((s) => s.openDialog);

  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayer = useRef<AnnotationLayer | null>(null);

  const [proxy, setProxy] = useState<PDFPageProxy | null>(null);
  const [textData, setTextData] = useState<SourcePageData | null>(null);
  const [visible, setVisible] = useState(index < 3);
  const [error, setError] = useState<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ item: TextEditOp; rect: Rect } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const drag = useRef<DragState>({ mode: 'none', startScreen: { x: 0, y: 0 }, startPdf: { x: 0, y: 0 } });

  const rotation = entry.rotation;
  const width = (entry.width || entry.mediaWidth || 612) * zoom;
  const height = (entry.height || entry.mediaHeight || 792) * zoom;

  /* ------------------------------ lazy render ----------------------------- */
  useEffect(() => {
    const node = pageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPageProxy(source, entry.sourceIndex)
      .then((page) => {
        if (cancelled) return;
        setProxy(page);
        // Keep page geometry in the store in sync with the real PDF.
        if (entry.mediaWidth === 0) {
          const view = page.view as number[];
          useDoc.getState().syncPageDims(entry.id, {
            mediaWidth: view[2] - view[0],
            mediaHeight: view[3] - view[1],
            baseRotation: page.rotate,
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This page could not be rendered.'));
    return () => {
      cancelled = true;
    };
  }, [source, entry.sourceIndex, entry.id, entry.mediaWidth]);

  const viewport = useMemo(() => {
    if (!proxy) return null;
    return proxy.getViewport({ scale: zoom, rotation });
  }, [proxy, zoom, rotation]);

  const viewportMatrix = useMemo(() => (viewport ? (viewport.transform as number[]).slice(0, 6) as [number, number, number, number, number, number] : null), [viewport]);

  /* -------------------------------- canvas -------------------------------- */
  useEffect(() => {
    if (!proxy || !visible || !canvasRef.current || !viewport) return;
    const canvas = canvasRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const task = proxy.render({
      canvas,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      background: '#ffffff',
    });
    task.promise.catch((err: unknown) => {
      const name = (err as { name?: string })?.name;
      if (name !== 'RenderingCancelledException') setError('This page could not be rendered.');
    });
    return () => task.cancel();
  }, [proxy, visible, viewport]);

  /* ------------------------------ text layer ------------------------------ */
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || !proxy || !visible || !viewport || !showTextLayer) return;
    let cancelled = false;
    let layer: TextLayer | null = null;
    container.replaceChildren();
    container.style.setProperty('--scale-factor', String(zoom));
    container.style.setProperty('--total-scale-factor', String(zoom));
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;
    getPageProxy(source, entry.sourceIndex)
      .then((page) => page.getTextContent())
      .then((content) => {
        if (cancelled) return;
        layer = new TextLayer({ textContentSource: content, container, viewport });
        return layer.render();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      try {
        layer?.cancel();
      } catch {
        /* noop */
      }
    };
  }, [proxy, visible, viewport, zoom, showTextLayer, source, entry.sourceIndex]);

  /* ---------------------------- annotation layer -------------------------- */
  useEffect(() => {
    const container = annotationLayerRef.current;
    if (!container || !proxy || !viewport || !showAnnotations) return;
    let cancelled = false;
    container.replaceChildren();
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;
    const linkService = {
      getDestinationHash: () => '#',
      getAnchorUrl: (hash: string) => hash,
      addLinkAttributes: (link: HTMLAnchorElement, url: string, newWindow?: boolean) => {
        link.href = url;
        link.rel = 'noopener';
        if (newWindow) link.target = '_blank';
      },
      goToDestination: () => undefined,
      goToPage: () => undefined,
      setHash: () => undefined,
      isPageVisible: () => true,
    };
    proxy
      .getAnnotations({ intent: 'display' })
      .then((annotations: unknown[]) => {
        if (cancelled || !annotations.length) return;
        const layer = new AnnotationLayer({
          div: container,
          page: proxy,
          viewport,
          accessibilityManager: null,
          annotationCanvasMap: null,
          annotationEditorUIManager: null,
          structTreeLayer: null,
          commentManager: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkService: linkService as any,
          annotationStorage: undefined,
        });
        annotationLayer.current = layer;
        return layer.render({
          viewport,
          div: container,
          annotations,
          page: proxy,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkService: linkService as any,
          renderForms: true,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      try {
        annotationLayer.current?.destroy();
        annotationLayer.current = null;
      } catch {
        /* noop */
      }
    };
  }, [proxy, viewport, showAnnotations]);

  /* ------------------------------- helpers -------------------------------- */
  const objectList = useMemo(
    () => (objectIds ?? []).map((id) => objectsById[id]).filter((o): o is AnyObject => Boolean(o)),
    [objectIds, objectsById],
  );

  const toPdf = useCallback(
    (clientX: number, clientY: number) => {
      const rect = pageRef.current!.getBoundingClientRect();
      const screen = { x: clientX - rect.left, y: clientY - rect.top };
      return screenToPdf(viewportMatrix ?? [1, 0, 0, 1, 0, 0], screen);
    },
    [viewportMatrix],
  );

  const hitTest = useCallback(
    (pdfPoint: { x: number; y: number }, pad = 4): AnyObject | null => {
      for (let i = objectList.length - 1; i >= 0; i--) {
        const object = objectList[i];
        if (object.locked) continue;
        const local = screenToLocal(viewportMatrix ?? [1, 0, 0, 1, 0, 0], object as Box, pdfToScreen(viewportMatrix ?? [1, 0, 0, 1, 0, 0], pdfPoint));
        if (local.x >= -pad && local.x <= object.w + pad && local.y >= -pad && local.y <= object.h + pad) return object;
      }
      return null;
    },
    [objectList, viewportMatrix],
  );

  const commitObjectText = useCallback(
    (id: string, text: string) => {
      updateObject(id, { text } as Partial<AnyObject>);
      setEditingObject(null);
      const object = useDoc.getState().objects[id];
      if (object?.kind === 'note') {
        if (text.trim()) {
          addComment({
            id: uid('thread'),
            objectId: id,
            pageId: entry.id,
            author: 'You',
            messages: [{ id: uid('msg'), author: 'You', body: text, at: Date.now() }],
            status: 'open',
            at: Date.now(),
          });
          setLeftPanel('comments');
        }
        setLeftPanel('comments');
      }
    },
    [updateObject, setEditingObject, addComment, entry.id, setLeftPanel],
  );

  /* ------------------------- object creation helpers ---------------------- */
  const defaultStyle = useCallback(
    () => ({
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      color: options.color,
      bold: options.bold,
      italic: options.italic,
      align: options.align,
      fill: null,
      border: null,
    }),
    [options],
  );

  const createTextMarkup = useCallback(
    (kind: 'highlight' | 'underline' | 'strike' | 'squiggly', dragRect: Rect, data: SourcePageData | null) => {
      const quads: Quad[] = [];
      let text = '';
      for (const item of data?.items ?? []) {
        for (const quad of item.quads) {
          const hit = intersectRects(dragRect, quad);
          if (hit || (quad.y >= dragRect.y && quad.y + quad.h <= dragRect.y + dragRect.h && quad.x + quad.w > dragRect.x - 2 && quad.x < dragRect.x + dragRect.w + 2)) {
            quads.push(hit ?? quad);
            text += `${item.str} `;
          }
        }
      }
      if (!quads.length) return;
      const box = boundsOfPoints(quads.flatMap((q) => [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]));
      addObject({
        id: uid('obj'),
        pageId: entry.id,
        kind,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        rotation: 0,
        opacity: kind === 'highlight' ? 0.45 : 1,
        color: kind === 'highlight' ? options.color || HIGHLIGHT_COLORS[0] : options.color,
        quads,
        text: text.trim(),
        createdAt: Date.now(),
      });
      setToolAfterCreate();
    },
    [addObject, entry.id, options.color],
  );

  const setToolAfterCreate = useCallback(() => {
    // Acrobat keeps the tool active; we switch back to select for one-shot
    // objects (text, note, stamp, signature) to avoid accidental duplicates.
    const tool = useUI.getState().tool;
    if (['text', 'note', 'stamp', 'signature', 'image', 'editText'].includes(tool)) useUI.getState().setTool('select');
  }, []);

  /* ------------------------------- pointers ------------------------------- */
  const onSurfacePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || !viewportMatrix) return;
    const startPdf = toPdf(event.clientX, event.clientY);
    drag.current = {
      mode: 'none',
      startScreen: { x: event.clientX, y: event.clientY },
      startPdf,
      currentPdf: startPdf,
    };

    if (tool === 'hand') {
      drag.current.mode = 'pan';
      return;
    }

    if (tool === 'select') {
      const hit = hitTest(startPdf);
      if (!hit) {
        setSelection([]);
        return;
      }
      if (event.altKey) {
        setSelection(selection.includes(hit.id) ? selection.filter((s) => s !== hit.id) : [...selection, hit.id]);
        return;
      }
      const nextSelection = selection.includes(hit.id) ? selection : [hit.id];
      setSelection(nextSelection);
      drag.current = {
        ...drag.current,
        mode: 'move',
        objectId: hit.id,
        startBox: { x: hit.x, y: hit.y, w: hit.w, h: hit.h, rotation: hit.rotation },
      };
      return;
    }

    if (tool === 'eraser') {
      const hit = hitTest(startPdf);
      if (hit) {
        removeObjects([hit.id]);
        useUI.getState().setStatusMessage('Object deleted');
      }
      return;
    }

    if (tool === 'image') {
      openDialog('insert-image', { pageId: entry.id, x: startPdf.x, y: startPdf.y });
      setToolAfterCreate();
      return;
    }

    if (tool === 'editText') {
      void beginTextEdit(startPdf);
      return;
    }

    if (tool === 'note') {
      const size = 18;
      const id = uid('obj');
      addObject({
        id,
        pageId: entry.id,
        kind: 'note',
        x: startPdf.x - size / 2,
        y: startPdf.y - size / 2,
        w: size,
        h: size,
        rotation: 0,
        opacity: 1,
        color: options.color,
        text: '',
        author: 'You',
        createdAt: Date.now(),
      });
      setSelection([id]);
      setEditingObject(id);
      setToolAfterCreate();
      return;
    }

    if (tool === 'stamp') {
      const stamp = STAMPS.find((s) => s.id === options.stampId) ?? STAMPS[0];
      const label = stamp.label;
      const w = Math.max(90, label.length * (options.fontSize * 0.62 + 4));
      const h = Math.min(46, w * 0.32);
      const id = uid('obj');
      addObject({
        id,
        pageId: entry.id,
        kind: 'stamp',
        x: startPdf.x - w / 2,
        y: startPdf.y - h / 2,
        w,
        h,
        rotation: 0,
        opacity: 0.92,
        label,
        color: stamp.color,
        variant: stamp.variant,
        detail: stamp.variant === 'dynamic' ? new Date().toLocaleDateString() : undefined,
        createdAt: Date.now(),
      });
      setSelection([id]);
      setRightPanel('properties');
      setToolAfterCreate();
      return;
    }

    if (tool === 'signature') {
      const preview = useUI.getState().previewStamp;
      if (preview?.kind === 'signature') {
        // A signature asset was prepared in the Fill & sign dialog: drop it here.
        const w = preview.w || 180;
        const h = preview.h || 56;
        const id = uid('obj');
        addObject({
          ...preview,
          id,
          pageId: entry.id,
          kind: 'signature',
          x: startPdf.x - w / 2,
          y: startPdf.y - h / 2,
          w,
          h,
          rotation: 0,
          opacity: preview.opacity ?? 1,
          createdAt: Date.now(),
        } as AnyObject);
        useUI.getState().setPreviewStamp(null);
        setSelection([id]);
        setRightPanel('properties');
        setToolAfterCreate();
        return;
      }
      openDialog('sign', { pageId: entry.id, x: startPdf.x, y: startPdf.y });
      return;
    }

    if (CREATION_TOOLS.includes(tool)) {
      drag.current = { ...drag.current, mode: 'create', points: [startPdf] };
    }
  };

  const onSurfacePointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (state.mode === 'none' && !state.objectId) return;
    const current = toPdf(event.clientX, event.clientY);
    state.currentPdf = current;

    if (state.mode === 'create') {
      state.points = [...(state.points ?? []), current];
      setInlineDragRect(state.startPdf, current);
      return;
    }
    if (state.mode === 'pan') {
      const dx = event.clientX - state.startScreen.x;
      const dy = event.clientY - state.startScreen.y;
      window.dispatchEvent(new CustomEvent('pdfmaster:pan', { detail: { dx, dy } }));
      state.startScreen = { x: event.clientX, y: event.clientY };
      return;
    }
  };

  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const setInlineDragRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
    setDragRect(rect);
  };

  /** Abandons an in-progress drag when the pointer leaves the page surface. */
  const onSurfacePointerCancel = () => {
    const state = drag.current;
    if (state.mode === 'none' && !state.objectId) return;
    if (state.mode === 'create' && state.createdId) {
      // A shape/inline object was already created during the drag: keep it.
      drag.current = { mode: 'none', startScreen: { x: 0, y: 0 }, startPdf: { x: 0, y: 0 } };
      return;
    }
    if (state.mode === 'move' || state.mode === 'resize' || state.mode === 'rotate') {
      useDoc.getState().undo();
    }
    drag.current = { mode: 'none', startScreen: { x: 0, y: 0 }, startPdf: { x: 0, y: 0 } };
    setDragRect(null);
  };

  const onSurfacePointerUp = async (event: React.PointerEvent) => {
    const state = drag.current;
    const endPdf = toPdf(event.clientX, event.clientY);
    const rect: Rect = {
      x: Math.min(state.startPdf.x, endPdf.x),
      y: Math.min(state.startPdf.y, endPdf.y),
      w: Math.abs(endPdf.x - state.startPdf.x),
      h: Math.abs(endPdf.y - state.startPdf.y),
    };
    setDragRect(null);
    drag.current = { mode: 'none', startScreen: { x: 0, y: 0 }, startPdf: endPdf };

    if (state.mode !== 'create') return;
    const tiny = rect.w < 4 && rect.h < 4;

    switch (tool) {
      case 'highlight':
      case 'underline':
      case 'strike':
      case 'squiggly': {
        const data = textData ?? (await getPageTextData(source, entry.sourceIndex));
        if (!textData) setTextData(data);
        createTextMarkup(tool, rect, data);
        break;
      }
      case 'draw': {
        const points = state.points ?? [];
        const simplified = simplify(points);
        if (simplified.length < 2) break;
        const box = boundsOfPoints(simplified);
        const w = Math.max(box.w, 1);
        const h = Math.max(box.h, 1);
        addObject({
          id: uid('obj'),
          pageId: entry.id,
          kind: 'ink',
          x: box.x,
          y: box.y,
          w,
          h,
          rotation: 0,
          opacity: options.opacity,
          color: options.color,
          strokeWidth: options.strokeWidth,
          highlighter: options.highlighter,
          strokes: [simplified.map((p) => ({ x: (p.x - box.x) / w, y: (p.y - box.y) / h }))],
          createdAt: Date.now(),
        });
        break;
      }
      case 'shape': {
        if (tiny && options.shape !== 'line' && options.shape !== 'arrow') break;
        addObject({
          id: uid('obj'),
          pageId: entry.id,
          kind: 'shape',
          x: rect.x,
          y: rect.y,
          w: Math.max(rect.w, 2),
          h: Math.max(rect.h, 2),
          rotation: 0,
          opacity: options.opacity,
          shape: options.shape,
          stroke: options.color,
          strokeWidth: options.strokeWidth,
          fill: options.fill,
          dashed: options.dashed,
          from: { x: 0, y: 0.5 },
          to: { x: 1, y: 0.5 },
          createdAt: Date.now(),
        });
        break;
      }
      case 'redact': {
        if (tiny) break;
        addObject({
          id: uid('obj'),
          pageId: entry.id,
          kind: 'redact',
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
          rotation: 0,
          opacity: 1,
          color: DEFAULT_ANNOTATE_COLORS.redact,
          applied: false,
          createdAt: Date.now(),
        });
        setRightPanel('properties');
        break;
      }
      case 'link': {
        if (tiny) break;
        const id = uid('obj');
        addObject({
          id,
          pageId: entry.id,
          kind: 'link',
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
          rotation: 0,
          opacity: 1,
          url: 'https://',
          linkType: 'url',
          createdAt: Date.now(),
        });
        setSelection([id]);
        setRightPanel('properties');
        toast('info', 'Link added — set the destination in the Properties panel.');
        break;
      }
      case 'measure': {
        if (tiny) break;
        addObject({
          id: uid('obj'),
          pageId: entry.id,
          kind: 'measure',
          x: rect.x,
          y: rect.y,
          w: Math.max(rect.w, 1),
          h: Math.max(rect.h, 1),
          rotation: 0,
          opacity: 1,
          from: { x: 0, y: 1 },
          to: { x: 1, y: 0 },
          stroke: options.color,
          strokeWidth: Math.max(0.75, options.strokeWidth * 0.6),
          pixelsPerUnit: UNIT_TO_POINTS[options.measureUnit] ?? 1,
          unitLabel: options.measureUnit,
          scale: options.measureScale,
          createdAt: Date.now(),
        });
        break;
      }
      case 'text': {
        const w = Math.max(140, 260 / zoom);
        const h = Math.max(28, options.fontSize * 2.6);
        const x = tiny ? state.startPdf.x : rect.x;
        const y = tiny ? state.startPdf.y - h : rect.y;
        const id = uid('obj');
        addObject({
          id,
          pageId: entry.id,
          kind: 'textbox',
          x,
          y,
          w: tiny ? w : Math.max(rect.w, 40),
          h: tiny ? h : Math.max(rect.h, 20),
          rotation: 0,
          opacity: options.opacity,
          text: '',
          style: defaultStyle(),
          createdAt: Date.now(),
        });
        setSelection([id]);
        setEditingObject(id);
        setRightPanel('properties');
        setToolAfterCreate();
        break;
      }
      case 'image': {
        openDialog('insert-image', { pageId: entry.id, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
        break;
      }
      case 'form-text':
      case 'form-checkbox':
      case 'form-radio':
      case 'form-dropdown':
      case 'form-button': {
        const kind = tool.replace('form-', '') as 'text' | 'checkbox' | 'radio' | 'dropdown' | 'button';
        const box =
          kind === 'checkbox' || kind === 'radio'
            ? { x: state.startPdf.x - 8, y: state.startPdf.y - 8, w: 16, h: 16 }
            : { x: rect.x, y: rect.y, w: Math.max(rect.w, 60), h: Math.max(rect.h, 20) };
        const id = uid('obj');
        addObject({
          id,
          pageId: entry.id,
          kind: 'formfield',
          ...box,
          rotation: 0,
          opacity: 1,
          field: kind,
          name: `${kind}_${(objectList.length + 1).toString().padStart(2, '0')}`,
          value: kind === 'dropdown' ? '' : '',
          options: kind === 'dropdown' ? ['Option 1', 'Option 2'] : undefined,
          fontSize: 10,
          checked: false,
          createdAt: Date.now(),
        });
        setSelection([id]);
        setRightPanel('properties');
        toast('success', 'Form field added. Export the PDF to make it fillable.');
        break;
      }
      default:
        break;
    }
  };

  /* ---------------------------- text editing ------------------------------ */
  const beginTextEdit = async (pdfPoint: { x: number; y: number }) => {
    const data = textData ?? (await getPageTextData(source, entry.sourceIndex));
    setTextData(data);
    const item = data.items.find((candidate) => {
      const quad = candidate.quads[0];
      return pdfPoint.x >= quad.x - 4 && pdfPoint.x <= quad.x + quad.w + 4 && pdfPoint.y >= quad.y - 4 && pdfPoint.y <= quad.y + quad.h + 4;
    });
    if (!item) {
      toast('info', 'Click directly on existing text to edit it.');
      return;
    }
    const quad = item.quads[0];
    setInlineEdit({
      rect: quad,
      item: {
        id: uid('edit'),
        pageId: entry.id,
        original: item.str,
        text: item.str,
        rect: quad,
        origin: item.origin,
        fontSize: item.fontSize,
        fontName: item.fontName,
        color: '#000000',
      },
    });
  };

  /* ------------------------- move / resize / rotate ----------------------- */
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = drag.current;
      if (state.mode !== 'move' && state.mode !== 'resize' && state.mode !== 'rotate') return;
      if (!state.objectId || !state.startBox || !viewportMatrix) return;
      const pdfPoint = toPdf(event.clientX, event.clientY);
      const object = useDoc.getState().objects[state.objectId];
      if (!object) return;

      if (state.mode === 'move') {
        const dx = pdfPoint.x - state.startPdf.x;
        const dy = pdfPoint.y - state.startPdf.y;
        const patches = (state.origins ?? [{ id: state.objectId!, x: state.startBox.x, y: state.startBox.y }]).map(
          (origin) => ({
            id: origin.id,
            patch: { x: origin.x + dx, y: origin.y + dy } as Partial<AnyObject>,
          }),
        );
        updateObjects(patches, { history: false });
        return;
      }
      if (state.mode === 'resize' && state.handle) {
        const local = screenToLocal(viewportMatrix, state.startBox, pdfPoint);
        const next = resizeBox({
          box: state.startBox,
          handle: state.handle,
          pointerLocal: local,
          shiftKey: event.shiftKey,
        });
        updateObject(state.objectId, { x: next.x, y: next.y, w: next.w, h: next.h } as Partial<AnyObject>, { history: false });
        return;
      }
      if (state.mode === 'rotate') {
        const rotation = rotationFromPointer(state.startBox, pdfPoint, state.startAngle ?? 0, state.startBox.rotation, event.shiftKey);
        updateObject(state.objectId, { rotation } as Partial<AnyObject>, { history: false });
      }
    };
    const onUp = () => {
      const state = drag.current;
      if (state.mode === 'move' || state.mode === 'resize' || state.mode === 'rotate') {
        drag.current = { mode: 'none', startScreen: { x: 0, y: 0 }, startPdf: { x: 0, y: 0 } };
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [toPdf, updateObject, updateObjects, viewportMatrix]);

  /* ------------------------------ object layer ---------------------------- */
  const startObjectDrag = (object: AnyObject) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (useUI.getState().tool !== 'select') return;
    event.stopPropagation();
    const pdfPoint = toPdf(event.clientX, event.clientY);
    if (event.altKey) {
      const current = useUI.getState().selection;
      setSelection(current.includes(object.id) ? current.filter((s) => s !== object.id) : [...current, object.id]);
      return;
    }
    const active = useUI.getState().selection.includes(object.id) ? useUI.getState().selection : [object.id];
    setSelection(active);
    setRightPanel('properties');
    useDoc.getState().pushHistory('Move object');
    drag.current = {
      mode: 'move',
      objectId: object.id,
      startScreen: { x: event.clientX, y: event.clientY },
      startPdf: pdfPoint,
      currentPdf: pdfPoint,
      startBox: { x: object.x, y: object.y, w: object.w, h: object.h, rotation: object.rotation },
      origins: active
        .map((id) => useDoc.getState().objects[id])
        .filter(Boolean)
        .map((o) => ({ id: o.id, x: o.x, y: o.y })),
    };
  };

  const handleHandleDrag = (handle: HandleId) => (event: React.PointerEvent) => {
    event.stopPropagation();
    const object = objectList.find((o) => o.id === selection[0]);
    if (!object) return;
    const box: Box = { x: object.x, y: object.y, w: object.w, h: object.h, rotation: object.rotation };
    const pdfPoint = toPdf(event.clientX, event.clientY);
    useDoc.getState().pushHistory('Transform object');
    drag.current = {
      mode: handle === 'rotate' ? 'rotate' : 'resize',
      objectId: object.id,
      handle,
      startScreen: { x: event.clientX, y: event.clientY },
      startPdf: pdfPoint,
      startBox: box,
      startAngle: angleToCenter(box, pdfPoint),
    };
  };

  const matrix = viewportMatrix;
  const selectedObject = selection.length === 1 ? objectList.find((o) => o.id === selection[0]) : undefined;
  const handleSpecs = selectedObject && matrix && tool === 'select' ? handlesFor(matrix, { ...selectedObject, rotation: selectedObject.rotation }) : [];

  if (error) {
    return (
      <div className="mx-auto my-6 w-[min(100%,720px)] rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-xs text-red-200">
        Page {index + 1}: {error}
      </div>
    );
  }

  return (
    <div className="relative mx-auto my-4 flex justify-center" data-page-index={index} data-page-id={entry.id}>
      <div
        ref={pageRef}
        className="pm-page-shadow relative bg-white"
        // pdf.js sizes its text/annotation layers from these custom properties
        // (they are normally provided by its own viewer shell).
        style={{
          width,
          height,
          ['--scale-factor' as string]: String(zoom),
          ['--total-scale-factor' as string]: String(zoom),
          ['--user-unit' as string]: '1',
          ['--scale-round-x' as string]: '1px',
          ['--scale-round-y' as string]: '1px',
        } as React.CSSProperties}
        onPointerDown={tool === 'select' || tool === 'hand' || tool === 'eraser' || tool === 'editText' ? onSurfacePointerDown : undefined}
      >
        <canvas ref={canvasRef} className="block" style={{ width, height }} />
        {entry.mediaWidth === 0 ? (
          <div className="pm-skeleton pointer-events-none absolute inset-0 z-[8]">
            <div className="absolute left-6 top-6 h-3 w-2/5 rounded bg-white/5" />
            <div className="absolute left-6 top-14 h-2 w-3/5 rounded bg-white/5" />
            <div className="absolute left-6 top-20 h-2 w-1/2 rounded bg-white/5" />
          </div>
        ) : null}
        {/* existing PDF text (selectable) */}
        {showTextLayer ? <div ref={textLayerRef} className="textLayer" /> : null}
        {/* existing PDF annotations & form widgets */}
        {showAnnotations ? <div ref={annotationLayerRef} className="annotationLayer" /> : null}

        {/* PDFmaster objects */}
        {matrix ? (
          <div className="absolute inset-0 z-[4]" style={{ pointerEvents: 'none' }}>
            {objectList.map((object) => {
              const m = objectMatrix(matrix, object as Box);
              const isSelected = selection.includes(object.id);
              return (
                <div
                  key={object.id}
                  data-object-id={object.id}
                  className="absolute left-0 top-0 origin-top-left"
                  style={{
                    width: object.w,
                    height: object.h,
                    transform: toCssMatrix(m),
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={startObjectDrag(object)}
                  onPointerEnter={() => setHoveredId(object.id)}
                  onPointerLeave={() => setHoveredId((id) => (id === object.id ? null : id))}
                >
                  <ObjectView
                    object={object}
                    assets={assets}
                    selected={isSelected}
                    editing={editingObject === object.id}
                    interactive={tool === 'select'}
                    onDoubleClick={() => {
                      if (object.kind === 'link' && object.url) window.open(object.url, '_blank', 'noopener');
                      else if (object.kind === 'textbox' || object.kind === 'note') setEditingObject(object.id);
                    }}
                    onCommitText={(text) => commitObjectText(object.id, text)}
                    onCancelText={() => setEditingObject(null)}
                  />
                  {tool === 'eraser' && hoveredId === object.id ? (
                    <span className="absolute inset-0 rounded-[2px] ring-2 ring-red-500/80" />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* selection handles */}
        {handleSpecs.length ? (
          <div className="absolute inset-0 z-[6]" style={{ pointerEvents: 'none' }}>
            {handleSpecs.map((handle) => (
              <div
                key={handle.id}
                className="pm-handle"
                style={{ left: handle.x - 5, top: handle.y - 5, cursor: handle.cursor, pointerEvents: 'auto' }}
                onPointerDown={handleHandleDrag(handle.id)}
              >
                {handle.id === 'rotate' ? <span className="absolute -inset-1" /> : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* live creation rectangle */}
        {dragRect && matrix ? (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            {(() => {
              const a = pdfToScreen(matrix, { x: dragRect.x, y: dragRect.y + dragRect.h });
              const b = pdfToScreen(matrix, { x: dragRect.x + dragRect.w, y: dragRect.y });
              const color = tool === 'redact' ? '#ff4a3d' : options.color;
              return (
                <div
                  className="absolute border"
                  style={{
                    left: Math.min(a.x, b.x),
                    top: Math.min(a.y, b.y),
                    width: Math.abs(b.x - a.x),
                    height: Math.abs(b.y - a.y),
                    borderColor: color,
                    background: tool === 'redact' ? 'rgba(0,0,0,0.45)' : `${color}22`,
                  }}
                />
              );
            })()}
          </div>
        ) : null}

        {/* creation surface: catches drags for drawing tools */}
        {CREATION_TOOLS.includes(tool) && tool !== 'image' && tool !== 'signature' ? (
          <div
            className="absolute inset-0 z-[7]"
            style={{ cursor: cursorForTool(tool) }}
            onPointerDown={onSurfacePointerDown}
            onPointerMove={onSurfacePointerMove}
            onPointerUp={onSurfacePointerUp}
            onPointerLeave={onSurfacePointerCancel}
          />
        ) : null}

        {/* inline text edit (in-place PDF text replacement) */}
        {inlineEdit && matrix ? (
          <InlineTextEditor
            rect={inlineEdit.rect}
            value={inlineEdit.item.original}
            matrix={matrix}
            zoom={zoom}
            onCancel={() => setInlineEdit(null)}
            onCommit={(text) => {
              const item = inlineEdit.item;
              if (text !== item.original) {
                addTextEdit({ ...item, text, id: uid('edit') });
                toast('success', 'Text updated — the change is applied on export and print.');
              }
              setInlineEdit(null);
              setToolAfterCreate();
            }}
          />
        ) : null}
      </div>

      <div className="absolute -left-12 top-0 hidden select-none text-2xs text-ink-400 xl:block">{index + 1}</div>
    </div>
  );
};

function cursorForTool(tool: ToolId): string {
  switch (tool) {
    case 'shape':
    case 'redact':
    case 'link':
    case 'measure':
    case 'text':
      return 'crosshair';
    case 'draw':
      return 'crosshair';
    case 'highlight':
    case 'underline':
    case 'strike':
    case 'squiggly':
      return 'text';
    case 'note':
    case 'stamp':
    case 'signature':
      return 'copy';
    case 'eraser':
      return 'not-allowed';
    default:
      return 'default';
  }
}

/** Await already-resolved values without making the caller async. */
function simplify(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const dx = points[i].x - prev.x;
    const dy = points[i].y - prev.y;
    if (Math.hypot(dx, dy) > 0.6) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function InlineTextEditor({
  rect,
  value,
  matrix,
  zoom,
  onCommit,
  onCancel,
}: {
  rect: Rect;
  value: string;
  matrix: [number, number, number, number, number, number];
  zoom: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const anchor = pdfToScreen(matrix, { x: rect.x, y: rect.y + rect.h });
  const bottom = pdfToScreen(matrix, { x: rect.x + rect.w, y: rect.y });
  const width = Math.max(80, Math.abs(bottom.x - anchor.x));
  const height = Math.max(16, Math.abs(bottom.y - anchor.y));
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div
      className="absolute z-[9]"
      style={{ left: Math.min(anchor.x, bottom.x), top: Math.min(anchor.y, bottom.y), width, height }}
    >
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') onCommit(text);
          if (event.key === 'Escape') onCancel();
        }}
        className="h-full w-full border border-brandblue bg-white/95 px-1 text-[13px] text-black outline-none"
        style={{ fontSize: Math.max(10, height * 0.8 * Math.min(1, zoom)) }}
        spellCheck={false}
      />
    </div>
  );
}
