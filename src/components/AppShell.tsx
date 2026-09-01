import React, { useEffect, useState } from 'react';
import { PAGES } from '../router';
import type { PageKey } from '../types/models';
import { useApp } from '../state/AppStore';
import { addDays, formatLongDate, isValidISODate } from '../lib/date';
import { Modal } from './Ui';
import { QUICK_ADD_TARGET, setIntent } from '../lib/bus';
import type { QuickAddKind } from '../lib/bus';

export function Header({ page }: { page: PageKey }): JSX.Element {
  const { selectedDate, setSelectedDate, today, saving, savedAt } = useApp();
  const [savedVisible, setSavedVisible] = useState(false);

  useEffect(() => {
    if (savedAt === null) return undefined;
    setSavedVisible(true);
    const id = window.setTimeout(() => setSavedVisible(false), 1800);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          <span className="brand-badge" aria-hidden="true">
            ◔
          </span>
          <span>Life Dashboard</span>
        </div>

        <div className="date-nav">
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            aria-label="Previous day"
          >
            ‹
          </button>
          <label className="visually-hidden" htmlFor="global-date">
            Selected date
          </label>
          <input
            id="global-date"
            type="date"
            value={selectedDate}
            max={addDays(today, 365)}
            onChange={(event) => {
              if (isValidISODate(event.target.value)) setSelectedDate(event.target.value);
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            aria-label="Next day"
          >
            ›
          </button>
          {selectedDate !== today && (
            <button type="button" className="btn btn-sm" onClick={() => setSelectedDate(today)}>
              Today
            </button>
          )}
        </div>

        <span aria-live="polite" className="nowrap">
          {saving ? (
            <span className="save-pill">Saving…</span>
          ) : savedVisible ? (
            <span className="save-pill">Saved ✓</span>
          ) : (
            <span className="visually-hidden">All changes saved</span>
          )}
        </span>

        <span className="visually-hidden" aria-live="polite">
          Viewing {formatLongDate(selectedDate)} on the {PAGES.find((p) => p.key === page)?.label} page.
        </span>
      </div>
    </header>
  );
}

export function NavBar({
  page,
  navigate,
  variant,
}: {
  page: PageKey;
  navigate: (page: PageKey) => void;
  variant: 'bottom' | 'sidebar';
}): JSX.Element {
  return (
    <nav
      className={variant === 'bottom' ? 'bottom-nav' : 'sidebar-nav'}
      aria-label={variant === 'bottom' ? 'Primary' : 'Sections'}
    >
      {PAGES.map((item) => (
        <button
          key={item.key}
          type="button"
          className="nav-link"
          aria-current={page === item.key ? 'page' : undefined}
          onClick={() => navigate(item.key)}
        >
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

const QUICK_OPTIONS: { kind: QuickAddKind; label: string; hint: string }[] = [
  { kind: 'task', label: 'Task', hint: 'A one-off or recurring task for the selected day' },
  { kind: 'food', label: 'Food / calories', hint: 'An itemised entry or the day quick total' },
  { kind: 'gym', label: 'Gym session', hint: 'Exercises, sets, reps and load' },
  { kind: 'run', label: 'Run', hint: 'Outdoor or treadmill, with pace and speed' },
  { kind: 'steps', label: 'Steps', hint: 'Daily step count' },
  { kind: 'study', label: 'Study session', hint: 'Subject, topic and minutes' },
  { kind: 'note', label: 'Day note / mood', hint: 'Notes, mood and energy for the day' },
];

export function QuickAdd({ navigate }: { navigate: (page: PageKey) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="quick-add-fab no-print"
        onClick={() => setOpen(true)}
        aria-label="Quick add an entry"
        title="Quick add"
      >
        +
      </button>
      {open && (
        <Modal title="Quick add" onClose={() => setOpen(false)}>
          <div className="grid grid-2">
            {QUICK_OPTIONS.map((option) => (
              <button
                key={option.kind}
                type="button"
                className="stat"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  setIntent(option.kind);
                  setOpen(false);
                  navigate(QUICK_ADD_TARGET[option.kind]);
                }}
              >
                <span className="stat-label">{option.label}</span>
                <span className="stat-sub">{option.hint}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

export function Toasts(): JSX.Element {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-stack no-print" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <span style={{ flex: 1 }}>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                await toast.undo?.run();
                dismissToast(toast.id);
              }}
            >
              {toast.undo.label}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function OfflineFlag(): JSX.Element | null {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const online = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-flag" role="status">
      Offline - your entries are still being saved on this device.
    </div>
  );
}

export function PageHero({
  title,
  subtitle,
  decor,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  decor?: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="page-hero">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
      {decor && <img className="hero-decor" src={decor} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
    </div>
  );
}
