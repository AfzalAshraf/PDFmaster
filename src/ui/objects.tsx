/**
 * On-screen rendering of PDFmaster objects.
 *
 * Every object is a single absolutely positioned element whose local space is
 * the object's own box (0..w, 0..h, y down). The element is placed with the
 * composed local->screen matrix, so page rotation, zoom and object rotation are
 * all handled by one transform — and what you see matches what gets drawn into
 * the PDF exactly (both use the same coordinate helpers).
 */
import React from 'react';
import type {
  AnyObject,
  Asset,
  HighlightObject,
  ImageObject,
  InkObject,
  LinkObject,
  MeasureObject,
  NoteObject,
  ShapeObject,
  SignatureObject,
  StampObject,
  TextBoxObject,
  WhiteoutObject,
} from '../core/types';
import type { FormFieldObject, RedactObject } from '../core/types';
import { cn } from '../core/utils';

export interface ObjectViewProps {
  object: AnyObject;
  assets: Record<string, Asset>;
  selected: boolean;
  editing: boolean;
  interactive: boolean;
  onCommitText?: (text: string) => void;
  onCancelText?: () => void;
  onDoubleClick?: () => void;
  onPointerDown?: (event: React.PointerEvent) => void;
}

const handleMarks = (selected: boolean, editing: boolean) =>
  cn(
    'absolute inset-0',
    selected && !editing && 'pm-object-selected',
    editing && 'ring-1 ring-brandblue/70',
  );

export const ObjectView: React.FC<ObjectViewProps> = ({
  object,
  assets,
  selected,
  editing,
  interactive,
  onCommitText,
  onCancelText,
  onDoubleClick,
  onPointerDown,
}) => {
  const chrome = handleMarks(selected, editing);
  const common = {
    onDoubleClick,
    onPointerDown,
  };
  switch (object.kind) {
    case 'highlight':
    case 'underline':
    case 'strike':
    case 'squiggly':
      return <MarkupView object={object} chrome={chrome} interactive={interactive} {...common} />;
    case 'note':
      return <NoteView object={object} chrome={chrome} selected={selected} {...common} />;
    case 'textbox':
      return (
        <TextBoxView
          object={object}
          chrome={chrome}
          editing={editing}
          interactive={interactive}
          onCommitText={onCommitText}
          onCancelText={onCancelText}
          {...common}
        />
      );
    case 'shape':
      return <ShapeView object={object} chrome={chrome} {...common} />;
    case 'ink':
      return <InkView object={object} chrome={chrome} {...common} />;
    case 'stamp':
      return <StampView object={object} chrome={chrome} {...common} />;
    case 'signature':
      return <SignatureView object={object} assets={assets} chrome={chrome} {...common} />;
    case 'image':
      return <ImageView object={object} assets={assets} chrome={chrome} {...common} />;
    case 'redact':
      return <RedactView object={object} chrome={chrome} {...common} />;
    case 'whiteout':
      return <WhiteoutView object={object} chrome={chrome} {...common} />;
    case 'measure':
      return <MeasureView object={object} chrome={chrome} {...common} />;
    case 'link':
      return <LinkView object={object} chrome={chrome} {...common} />;
    case 'formfield':
      return <FormFieldView object={object} chrome={chrome} {...common} />;
    default:
      return null;
  }
};

const handleStyle: React.CSSProperties = { cursor: 'move', pointerEvents: 'auto' };

/* ------------------------------- markup -------------------------------- */

function MarkupView({
  object,
  chrome,
  interactive,
  ...rest
}: { object: HighlightObject; chrome: string; interactive: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const colors: Record<string, string> = {
    highlight: object.color,
    underline: object.color,
    strike: object.color,
    squiggly: object.color,
  };
  const color = colors[object.kind];
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <svg width={object.w} height={object.h} viewBox={`0 0 ${object.w} ${object.h}`} className="overflow-visible" style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
        {object.quads.map((q, i) => {
          const x = q.x - object.x;
          const yTop = object.y + object.h - (q.y + q.h);
          switch (object.kind) {
            case 'highlight':
              return (
                <rect
                  key={i}
                  x={x - 0.5}
                  y={yTop - 0.5}
                  width={q.w + 1}
                  height={q.h + 1}
                  fill={color}
                  fillOpacity={Math.min(0.85, object.opacity + 0.25)}
                  style={{ mixBlendMode: 'multiply' }}
                />
              );
            case 'underline':
              return <rect key={i} x={x} y={yTop + q.h - Math.max(1.2, q.h * 0.07)} width={q.w} height={Math.max(1.2, q.h * 0.07)} fill={color} />;
            case 'strike':
              return <rect key={i} x={x} y={yTop + q.h * 0.45} width={q.w} height={Math.max(1.2, q.h * 0.07)} fill={color} />;
            case 'squiggly': {
              return <Squiggly key={i} x={x} y={yTop + q.h * 0.86} w={q.w} h={Math.max(2, q.h * 0.12)} color={color} />;
            }
            default:
              return null;
          }
        })}
      </svg>
    </div>
  );
}

function Squiggly({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  const step = Math.max(3, h * 2.2);
  const points: string[] = [];
  let up = true;
  for (let px = 0; px <= w; px += step) {
    points.push(`${px},${up ? 0 : h}`);
    up = !up;
  }
  return <polyline points={points.map((p) => p.split(',').map((v) => Number(v)).map((v, i) => (i === 0 ? v + x : v + y)).join(',')).join(' ')} fill="none" stroke={color} strokeWidth={Math.max(0.8, h * 0.5)} />;
}

/* -------------------------------- note --------------------------------- */

function NoteView({
  object,
  chrome,
  selected,
  ...rest
}: { object: NoteObject; chrome: string; selected: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const size = Math.min(object.w, object.h);
  return (
    <div className={chrome} style={handleStyle} {...rest} title={object.text}>
      <div
        className="flex items-center justify-center rounded-[3px] font-bold text-white shadow-sm"
        style={{ width: size, height: size, background: object.color, fontSize: size * 0.6, lineHeight: 1 }}
      >
        !
      </div>
      {(selected || object.open) && object.text ? (
        <div
          className="absolute left-full top-0 z-20 ml-2 w-[210px] rounded-lg border border-amber-400/60 bg-[#2b2718] p-2 text-xs text-amber-50 shadow-menu"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="mb-1 text-2xs uppercase tracking-wide text-amber-300/80">{object.author ?? 'Comment'}</div>
          <div className="whitespace-pre-wrap leading-4">{object.text}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------- textbox ------------------------------- */

function TextBoxView({
  object,
  chrome,
  editing,
  interactive,
  onCommitText,
  onCancelText,
  ...rest
}: {
  object: TextBoxObject;
  chrome: string;
  editing: boolean;
  interactive: boolean;
  onCommitText?: (text: string) => void;
  onCancelText?: () => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  const style = object.style;
  const css: React.CSSProperties = {
    fontSize: style.fontSize,
    fontFamily: `"${style.fontFamily}", Helvetica, Arial, sans-serif`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color,
    textAlign: style.align ?? 'left',
    lineHeight: style.lineHeight ?? 1.25,
    background: style.fill ?? 'transparent',
    border: style.border ? `${style.borderWidth ?? 0.75}px solid ${style.border}` : 'none',
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    wordBreak: 'break-word',
    pointerEvents: interactive || editing ? 'auto' : 'none',
  };
  if (editing) {
    return (
      <div className={chrome} style={handleStyle} {...rest}>
        <textarea
          autoFocus
          defaultValue={object.text}
          onBlur={(e) => onCommitText?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancelText?.();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onCommitText?.((e.target as HTMLTextAreaElement).value);
            e.stopPropagation();
          }}
          style={{ ...css, width: '100%', height: '100%', resize: 'none', outline: 'none', padding: 0 }}
          spellCheck={false}
        />
      </div>
    );
  }
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <div style={{ ...css, width: '100%', height: '100%', opacity: object.opacity }}>{object.text}</div>
    </div>
  );
}

/* -------------------------------- shape -------------------------------- */

function ShapeView({ object, chrome, ...rest }: { object: ShapeObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  const local = (p?: { x: number; y: number }, fallback = { x: 0, y: 0 }) => ({
    x: (p?.x ?? fallback.x) * object.w,
    y: (1 - (p?.y ?? fallback.y)) * object.h,
  });
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <svg width={object.w} height={object.h} viewBox={`0 0 ${object.w} ${object.h}`} style={{ overflow: 'visible' }}>
        {object.shape === 'rect' && (
          <rect
            x={object.strokeWidth / 2}
            y={object.strokeWidth / 2}
            width={Math.max(1, object.w - object.strokeWidth)}
            height={Math.max(1, object.h - object.strokeWidth)}
            fill={object.fill ?? 'none'}
            fillOpacity={object.fill ? object.opacity : 0}
            stroke={object.stroke}
            strokeWidth={object.strokeWidth}
            strokeDasharray={object.dashed ? `${object.strokeWidth * 2.5} ${object.strokeWidth * 2}` : undefined}
          />
        )}
        {object.shape === 'ellipse' && (
          <ellipse
            cx={object.w / 2}
            cy={object.h / 2}
            rx={Math.max(1, object.w / 2 - object.strokeWidth / 2)}
            ry={Math.max(1, object.h / 2 - object.strokeWidth / 2)}
            fill={object.fill ?? 'none'}
            fillOpacity={object.fill ? object.opacity : 0}
            stroke={object.stroke}
            strokeWidth={object.strokeWidth}
            strokeDasharray={object.dashed ? `${object.strokeWidth * 2.5} ${object.strokeWidth * 2}` : undefined}
          />
        )}
        {(object.shape === 'line' || object.shape === 'arrow') &&
          (() => {
            const a = local(object.from, { x: 0, y: 0.5 });
            const b = local(object.to, { x: 1, y: 0.5 });
            return (
              <g>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={object.stroke} strokeWidth={object.strokeWidth} strokeDasharray={object.dashed ? `${object.strokeWidth * 2.5} ${object.strokeWidth * 2}` : undefined} />
                {object.shape === 'arrow' ? <ArrowHead a={a} b={b} color={object.stroke} width={object.strokeWidth} /> : null}
              </g>
            );
          })()}
        {object.shape === 'polygon' &&
          (() => {
            const points = (object.points ?? []).map((p) => local(p));
            return (
              <polygon
                points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={object.fill ?? 'none'}
                stroke={object.stroke}
                strokeWidth={object.strokeWidth}
              />
            );
          })()}
        {object.shape === 'cloud' && <Cloud w={object.w} h={object.h} stroke={object.stroke} strokeWidth={object.strokeWidth} />}
      </svg>
    </div>
  );
}

function ArrowHead({ a, b, color, width }: { a: { x: number; y: number }; b: { x: number; y: number }; color: string; width: number }) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const size = Math.max(7, width * 4.2);
  const spread = 0.42;
  const p1 = { x: b.x - size * Math.cos(angle - spread), y: b.y - size * Math.sin(angle - spread) };
  const p2 = { x: b.x - size * Math.cos(angle + spread), y: b.y - size * Math.sin(angle + spread) };
  return <polygon points={`${p1.x},${p1.y} ${b.x},${b.y} ${p2.x},${p2.y}`} fill={color} />;
}

function Cloud({ w, h, stroke, strokeWidth }: { w: number; h: number; stroke: string; strokeWidth: number }) {
  const lobes = 16;
  const r = Math.min(w, h) / 2;
  const points: string[] = [];
  for (let i = 0; i < lobes; i++) {
    const angle = (i / lobes) * Math.PI * 2;
    const bulge = i % 2 === 0 ? r * 0.18 : 0;
    const x = w / 2 + (w / 2) * Math.cos(angle) + Math.cos(angle) * bulge;
    const y = h / 2 + (h / 2) * Math.sin(angle) + Math.sin(angle) * bulge;
    points.push(`${x},${y}`);
  }
  return <polygon points={points.join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth} />;
}

/* --------------------------------- ink --------------------------------- */

function InkView({ object, chrome, ...rest }: { object: InkObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  const d = object.strokes
    .map((stroke) =>
      stroke
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * object.w} ${(1 - p.y) * object.h}`)
        .join(' '),
    )
    .join(' ');
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <svg width={object.w} height={object.h} viewBox={`0 0 ${object.w} ${object.h}`} style={{ overflow: 'visible', mixBlendMode: object.highlighter ? 'multiply' : undefined }}>
        <path
          d={d}
          fill="none"
          stroke={object.color}
          strokeWidth={object.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={object.highlighter ? 0.45 : object.opacity}
        />
      </svg>
    </div>
  );
}

/* -------------------------------- stamp -------------------------------- */

function StampView({ object, chrome, ...rest }: { object: StampObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  const fontSize = Math.min(object.h * 0.48, (object.w / Math.max(4, object.label.length)) * 1.75);
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <div
        className="flex h-full w-full flex-col items-center justify-center rounded-[3px] text-center font-bold uppercase"
        style={{
          border: `${Math.max(1, object.h * 0.05)}px solid ${object.color}`,
          color: object.color,
          fontSize,
          letterSpacing: '0.02em',
          opacity: object.opacity,
          lineHeight: 1.05,
        }}
      >
        <span className="truncate px-1">{object.label}</span>
        {object.detail ? <span style={{ fontSize: fontSize * 0.6 }}>{object.detail}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------ signature ------------------------------ */

function SignatureView({
  object,
  assets,
  chrome,
  ...rest
}: { object: SignatureObject; assets: Record<string, Asset>; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  const asset = object.assetId ? assets[object.assetId] : undefined;
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      {asset ? (
        <img src={asset.dataUrl} alt="Signature" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <div
          className="flex h-full w-full items-center"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            fontSize: Math.min(object.h * 0.62, 26),
            color: object.style?.color ?? '#14213d',
          }}
        >
          {object.text}
        </div>
      )}
      {object.rule ? <div className="absolute -bottom-0.5 left-0 right-0 h-px bg-ink-400/80" /> : null}
      {object.signer ? <div className="absolute -bottom-3 left-0 text-[7.5px] text-ink-300">{object.signer}</div> : null}
    </div>
  );
}

/* -------------------------------- image -------------------------------- */

function ImageView({
  object,
  assets,
  chrome,
  ...rest
}: { object: ImageObject; assets: Record<string, Asset>; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  const asset = assets[object.assetId];
  if (!asset) {
    return (
      <div className={chrome} style={handleStyle} {...rest}>
        <div className="pm-checkerboard flex h-full w-full items-center justify-center text-2xs text-ink-300">missing image</div>
      </div>
    );
  }
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <img
        src={asset.dataUrl}
        alt={asset.name ?? 'Image'}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: object.fit === 'stretch' ? 'fill' : 'contain', opacity: object.opacity, pointerEvents: 'none' }}
      />
    </div>
  );
}

/* ------------------------------- redact -------------------------------- */

function RedactView({ object, chrome, ...rest }: { object: RedactObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <div
        className="h-full w-full"
        style={{
          background: object.color,
          boxShadow: object.applied ? 'none' : 'inset 0 0 0 1px rgba(255,74,61,0.9)',
          position: 'relative',
        }}
      >
        {!object.applied ? (
          <span className="absolute left-1 top-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/80">redact</span>
        ) : null}
      </div>
    </div>
  );
}

function WhiteoutView({ object, chrome, ...rest }: { object: WhiteoutObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={chrome} style={{ ...handleStyle, background: object.color, opacity: object.opacity }} {...rest} />;
}

/* ------------------------------- measure ------------------------------- */

function MeasureView({ object, chrome, ...rest }: { object: MeasureObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  const local = (p: { x: number; y: number }) => ({ x: p.x * object.w, y: (1 - p.y) * object.h });
  const a = local(object.from);
  const b = local(object.to);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const label = `${((length / object.pixelsPerUnit) * object.scale).toFixed(2)} ${object.unitLabel}`;
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <svg width={object.w} height={object.h} viewBox={`0 0 ${object.w} ${object.h}`} style={{ overflow: 'visible' }}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={object.stroke} strokeWidth={object.strokeWidth} />
        <ArrowHead a={a} b={b} color={object.stroke} width={object.strokeWidth} />
        <ArrowHead a={b} b={a} color={object.stroke} width={object.strokeWidth} />
      </svg>
      <div
        className="absolute whitespace-nowrap rounded border px-1 py-[1px] text-[9px] font-semibold"
        style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2, transform: 'translate(-50%, -140%)', background: '#fff', borderColor: object.stroke, color: object.stroke }}
      >
        {label}
      </div>
    </div>
  );
}

/* --------------------------------- link -------------------------------- */

function LinkView({ object, chrome, ...rest }: { object: LinkObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={chrome} style={handleStyle} {...rest} title={object.url}>
      <div
        className="h-full w-full rounded-[2px]"
        style={{
          background: 'rgba(47,137,255,0.14)',
          border: '1px dashed rgba(47,137,255,0.85)',
        }}
      />
    </div>
  );
}

/* ------------------------------ form field ----------------------------- */

function FormFieldView({ object, chrome, ...rest }: { object: FormFieldObject; chrome: string } & React.HTMLAttributes<HTMLDivElement>) {
  const label =
    object.field === 'checkbox'
      ? object.checked
        ? '✓'
        : ''
      : object.field === 'radio'
        ? object.checked
          ? '●'
          : ''
        : object.value || object.name || object.field;
  return (
    <div className={chrome} style={handleStyle} {...rest}>
      <div
        className={cn(
          'flex h-full w-full items-center border border-brandblue/70 bg-white/95 px-1 text-[10px] text-[#111]',
          object.field === 'checkbox' || object.field === 'radio' ? 'justify-center rounded-[2px]' : 'rounded-[2px]',
        )}
      >
        <span className="truncate">{label}</span>
      </div>
      <span className="absolute -top-3 left-0 rounded bg-brandblue px-1 text-[8px] font-medium uppercase tracking-wide text-white">
        {object.field}
      </span>
    </div>
  );
}
