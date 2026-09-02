import React, { useEffect, useRef, useState } from 'react';
import { round } from '../lib/validate';

/**
 * Stable, colon-free DOM ids. React's own useId emits values containing ':',
 * which is legal HTML but breaks querySelector-based tooling and some
 * assistive-technology lookups, so ids are minted here instead.
 */
let idCounter = 0;
export function useDomId(prefix: string): string {
  const [id] = useState(() => {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
  });
  return id;
}

/* -------------------------------------------------------------------- card */

export function Card({
  title,
  subtitle,
  actions,
  children,
  decor,
  as: Tag = 'section',
  className = '',
  headingLevel = 2,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  decor?: string;
  as?: 'section' | 'div' | 'article';
  className?: string;
  headingLevel?: 2 | 3;
}): JSX.Element {
  const Heading = (headingLevel === 2 ? 'h2' : 'h3') as 'h2' | 'h3';
  return (
    <Tag className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <Heading>{title}</Heading>}
            {subtitle && <div className="small muted">{subtitle}</div>}
          </div>
          {actions && <div className="spacer row">{actions}</div>}
        </div>
      )}
      {children}
      {decor && <img className="card-decor" src={decor} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
    </Tag>
  );
}

/* -------------------------------------------------------------------- stat */

export function Stat({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
  onClick?: () => void;
}): JSX.Element {
  const content = (
    <>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ? `tone-${tone}` : ''}`}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="stat" onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer' }}>
        {content}
      </button>
    );
  }
  return <div className="stat">{content}</div>;
}

/* ---------------------------------------------------------------- progress */

export function ProgressBar({
  label,
  value,
  target,
  unit = '',
  decimals = 0,
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  decimals?: number;
}): JSX.Element {
  const percent = target > 0 ? (value / target) * 100 : 0;
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row small">
        <span className="strong">{label}</span>
        <span className="right muted">
          {round(value, decimals)}
          {unit} / {round(target, decimals)}
          {unit} ({round(percent, 0)}%)
        </span>
      </div>
      <div
        className={`bar ${percent > 105 ? 'over' : ''}`}
        role="progressbar"
        aria-valuenow={round(value, decimals)}
        aria-valuemin={0}
        aria-valuemax={round(target, decimals) || 100}
        aria-label={`${label}: ${round(value, decimals)}${unit} of ${round(target, decimals)}${unit}`}
      >
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function ProgressRing({
  percent,
  label,
  size = 132,
  caption,
}: {
  percent: number;
  label: string;
  size?: number;
  caption?: string;
}): JSX.Element {
  const stroke = size * 0.1;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="ring-wrap">
      <svg
        className="ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${round(clamped, 0)} per cent`}
      >
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text className="ring-label" x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.24}>
          {round(clamped, 0)}%
        </text>
      </svg>
      {caption && <div className="small muted" style={{ maxWidth: 220 }}>{caption}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

export function Badge({
  children,
  tone = 'primary',
}: {
  children: React.ReactNode;
  tone?: 'primary' | 'ok' | 'bad' | 'warn' | 'neutral';
}): JSX.Element {
  return <span className={`badge ${tone === 'primary' ? '' : tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p className="small">{children}</p>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
}

export function Field({ label, hint, error, children }: FieldShellProps): JSX.Element {
  const id = useDomId('field');
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, describedBy)}
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error-text" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  type = 'text',
  required,
  maxLength = 120,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  type?: 'text' | 'time' | 'date' | 'search' | 'password';
  required?: boolean;
  maxLength?: number;
}): JSX.Element {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  hint,
  error,
  min = 0,
  max = 1_000_000,
  step = 1,
  suffix,
  allowEmpty = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  allowEmpty?: boolean;
}): JSX.Element {
  return (
    <Field label={suffix ? `${label} (${suffix})` : label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value === null ? '' : String(value)}
          min={min}
          max={max}
          step={step}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '') {
              onChange(allowEmpty ? null : 0);
              return;
            }
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) return;
            onChange(Math.min(max, Math.max(min, parsed)));
          }}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  maxLength = 2000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
  maxLength?: number;
}): JSX.Element {
  return (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={rows}
          value={value}
          maxLength={maxLength}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}): JSX.Element {
  return (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <select id={id} value={value} aria-describedby={describedBy} onChange={(event) => onChange(event.target.value as T)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}): JSX.Element {
  const id = useDomId('toggle');
  return (
    <div className="switch-row">
      <label htmlFor={id}>
        {label}
        {hint && <div className="hint" style={{ fontWeight: 400 }}>{hint}</div>}
      </label>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- modal */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useDomId('dialog-title');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Mount-only: moving focus on every render would steal it back from whatever
  // field the user is typing in.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
        style={wide ? { maxWidth: 860 } : undefined}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog">
            X
          </button>
        </div>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  requireTyping,
  onConfirm,
  onCancel,
  danger = true,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  requireTyping?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const blocked = Boolean(requireTyping) && typed.trim().toUpperCase() !== requireTyping?.toUpperCase();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={blocked}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className={`note-banner ${danger ? 'danger' : ''}`}>{message}</div>
        {requireTyping && (
          <TextInput
            label={`Type ${requireTyping} to confirm`}
            value={typed}
            onChange={setTyped}
            hint="This protects you from an accidental bulk change."
          />
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- misc */

export function SectionTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div className="row" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`tab-${option.value}`}
          aria-selected={value === option.value}
          aria-controls={`panel-${option.value}`}
          className={`chip ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: React.ReactNode }): JSX.Element {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="stack">
      {children}
    </div>
  );
}
