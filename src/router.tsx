import { useCallback, useEffect, useState } from 'react';
import type { PageKey } from './types/models';

export const PAGES: { key: PageKey; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: '☀' },
  { key: 'tasks', label: 'Tasks', icon: '✓' },
  { key: 'nutrition', label: 'Nutrition', icon: '◕' },
  { key: 'fitness', label: 'Fitness', icon: '⚡' },
  { key: 'study', label: 'Study', icon: '✎' },
  { key: 'calendar', label: 'Calendar', icon: '▦' },
  { key: 'analytics', label: 'Analytics', icon: '↗' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

const KEYS = PAGES.map((page) => page.key);

function readHash(): PageKey {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (KEYS as string[]).includes(raw) ? (raw as PageKey) : 'today';
}

/** Tiny hash router: no dependency, works from `file://` and any sub-path. */
export function useRoute(): { page: PageKey; navigate: (page: PageKey) => void } {
  const [page, setPage] = useState<PageKey>(() => (typeof window === 'undefined' ? 'today' : readHash()));

  useEffect(() => {
    const onHashChange = () => setPage(readHash());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.location.replace('#/today');
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: PageKey) => {
    window.location.hash = `#/${next}`;
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return { page, navigate };
}
