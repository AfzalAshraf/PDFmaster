/** Small, dependency-light UI kit shared by every panel and dialog. */
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check, X, Info, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../core/utils';
import { useUI } from '../state/ui';

export function IconButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  size = 'md',
  variant = 'ghost',
  className,
  badge,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'solid' | 'danger' | 'accent';
  className?: string;
  badge?: string;
}) {
  const sizes = { sm: 14, md: 16, lg: 18 } as const;
  const box = { sm: 'h-6 w-6', md: 'h-7 w-7', lg: 'h-9 w-9' } as const;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'pm-focus-ring relative inline-flex items-center justify-center rounded-md transition-colors',
        box[size],
        variant === 'ghost' && 'text-ink-200 hover:bg-ink-700 hover:text-white',
        variant === 'solid' && 'bg-ink-700 text-ink-100 hover:bg-ink-600',
        variant === 'danger' && 'text-red-300 hover:bg-red-500/20 hover:text-red-200',
        variant === 'accent' && 'bg-accent text-white hover:bg-accent-hover',
        active && variant === 'ghost' && 'bg-ink-700 text-white',
        active && variant === 'solid' && 'bg-accent text-white hover:bg-accent-hover',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      <Icon size={sizes[size]} />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 rounded bg-accent px-1 text-[9px] font-semibold text-white">{badge}</span>
      ) : null}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  icon: Icon,
  className,
  type = 'button',
  full,
}: {
  children?: React.ReactNode;
  onClick?: (event: React.MouseEvent) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  disabled?: boolean;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  className?: string;
  type?: 'button' | 'submit';
  full?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'pm-focus-ring inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-base',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' && 'border border-ink-600 bg-ink-750 text-ink-100 hover:bg-ink-700',
        variant === 'ghost' && 'text-ink-200 hover:bg-ink-700 hover:text-white',
        variant === 'subtle' && 'bg-ink-700/60 text-ink-100 hover:bg-ink-700',
        variant === 'danger' && 'bg-red-600/90 text-white hover:bg-red-500',
        disabled && 'pointer-events-none opacity-45',
        full && 'w-full',
        className,
      )}
    >
      {Icon ? <Icon size={size === 'sm' ? 13 : 15} /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn('block', className)}>
      <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-2xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          'pm-focus-ring h-8 w-full rounded-md border border-ink-600 bg-ink-900 px-2 text-base text-ink-50 placeholder:text-ink-400',
          className,
        )}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        {...props}
        className={cn(
          'pm-focus-ring w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-base text-ink-50 placeholder:text-ink-400',
          className,
        )}
      />
    );
  },
);

export function Select({
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pm-focus-ring h-8 w-full appearance-none rounded-md border border-ink-600 bg-ink-900 pl-2 pr-7 text-base text-ink-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-300" />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'pm-focus-ring relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-ink-600',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
            checked ? 'left-3.5' : 'left-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-base leading-4 text-ink-100">{label}</span>
        {hint ? <span className="block text-2xs text-ink-400">{hint}</span> : null}
      </label>
    </div>
  );
}

export function ColorSwatch({
  value,
  onChange,
  palette,
  allowCustom = true,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  palette: string[];
  allowCustom?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label ?? 'Colour'}
        onClick={() => setOpen((v) => !v)}
        className="pm-focus-ring flex h-7 items-center gap-1.5 rounded-md border border-ink-600 bg-ink-750 px-1.5"
      >
        <span className="h-4 w-4 rounded border border-black/40" style={{ background: value }} />
        <ChevronDown size={12} className="text-ink-300" />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-44 animate-pop-in rounded-lg border border-ink-700 bg-ink-800 p-2 shadow-menu">
          <div className="grid grid-cols-5 gap-1.5">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
                style={{ background: color }}
                className={cn(
                  'h-6 w-6 rounded border border-black/40 transition-transform hover:scale-110',
                  value.toLowerCase() === color.toLowerCase() && 'ring-2 ring-accent',
                )}
                title={color}
              />
            ))}
          </div>
          {allowCustom ? (
            <div className="mt-2 flex items-center gap-2 border-t border-ink-700 pt-2">
              <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-8" />
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-6 px-1 text-2xs uppercase"
                spellCheck={false}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-2xs text-ink-300">
        <span className="font-medium uppercase tracking-wide">{label}</span>
        <span className="tabular-nums text-ink-200">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function Menu({
  open,
  onClose,
  children,
  className,
  width = 250,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      style={{ width }}
      className={cn(
        'absolute left-0 top-full z-50 mt-0.5 animate-pop-in rounded-lg border border-ink-700 bg-ink-800 py-1 shadow-menu',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  shortcut,
  disabled,
  checked,
  icon: Icon,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-base text-ink-100 hover:bg-ink-700',
        danger && 'text-red-300 hover:bg-red-500/15',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <span className="w-4 shrink-0 text-ink-300">{checked ? <Check size={13} /> : Icon ? <Icon size={14} /> : null}</span>
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="ml-3 shrink-0 text-2xs text-ink-400">{shortcut}</span> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-ink-700" />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
  kind = 'dialog',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  kind?: 'dialog' | 'panel';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className={cn(
          'relative z-10 max-h-[88vh] animate-pop-in overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-menu',
          kind === 'panel' && 'border-ink-600',
        )}
      >
        <header className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
          <h2 className="text-md font-semibold text-white">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-ink-700 px-4 py-2.5">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-700', className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-2xs font-medium',
        tone === 'neutral' && 'bg-ink-700 text-ink-200',
        tone === 'accent' && 'bg-accent-soft text-accent-hover',
        tone === 'success' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'warning' && 'bg-amber-500/15 text-amber-300',
        tone === 'danger' && 'bg-red-500/15 text-red-300',
      )}
    >
      {children}
    </span>
  );
}

export function ToastStack() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  const icons = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
  } as const;
  return (
    <div className="pointer-events-none fixed bottom-16 right-4 z-[90] flex w-[340px] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.kind];
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex animate-slide-up items-start gap-2 rounded-lg border px-3 py-2 shadow-menu',
              toast.kind === 'error' && 'border-red-500/40 bg-[#2a1a1c]',
              toast.kind === 'warning' && 'border-amber-500/40 bg-[#2a2418]',
              toast.kind === 'success' && 'border-emerald-500/40 bg-[#16241d]',
              toast.kind === 'info' && 'border-ink-600 bg-ink-800',
            )}
          >
            <Icon size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1 text-base leading-5 text-ink-50">{toast.message}</div>
            {toast.action ? (
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-accent-hover hover:underline"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button type="button" onClick={() => dismiss(toast.id)} className="shrink-0 text-ink-400 hover:text-white">
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function BusyOverlay() {
  const busy = useUI((s) => s.busy);
  if (!busy.active) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
      <div className="w-[360px] animate-pop-in rounded-xl border border-ink-700 bg-ink-850 p-5 shadow-menu">
        <div className="mb-3 flex items-center gap-2 text-md font-medium text-white">
          <Loader2 size={16} className="animate-spin text-accent" />
          {busy.label || 'Working…'}
        </div>
        <ProgressBar value={busy.progress} />
        <div className="mt-2 text-right text-2xs text-ink-400">{Math.round(busy.progress)}%</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-300">{children}</h3>
      {right}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon size={26} className="text-ink-400" />
      <div className="text-base font-medium text-ink-100">{title}</div>
      {hint ? <div className="text-xs text-ink-400">{hint}</div> : null}
      {action}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { id: T; label: string; badge?: string }[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'rounded-md px-2 py-1 text-xs transition-colors',
            value === item.id ? 'bg-accent-soft text-accent-hover' : 'text-ink-300 hover:bg-ink-700 hover:text-ink-100',
          )}
        >
          {item.label}
          {item.badge ? <span className="ml-1 text-2xs text-ink-400">{item.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
