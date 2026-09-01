import React, { useEffect } from 'react';
import type { PageKey, Settings } from '../types/models';

export function decorUrl(name: string): string {
  if (!name) return '';
  if (name.startsWith('http') || name.startsWith('/')) return name;
  return `${import.meta.env.BASE_URL}decor/${name}.svg`;
}

/**
 * Applies the per-page palette as CSS custom properties, plus the global theme
 * mode and motion preference on the document root.
 */
export function ThemeScope({
  page,
  settings,
  children,
}: {
  page: PageKey;
  settings: Settings;
  children: React.ReactNode;
}): JSX.Element {
  const theme = settings.pageThemes[page] ?? settings.pageThemes.today;

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
      const dark = settings.themeMode === 'dark' || (settings.themeMode === 'system' && prefersDark);
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    apply();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [settings.themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', settings.reducedMotion ? 'reduced' : 'full');
  }, [settings.reducedMotion]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.primary);
  }, [theme.primary]);

  return (
    <div
      style={
        {
          '--primary': theme.primary,
          '--accent': theme.accent,
          '--surface-tint': theme.surface,
          display: 'contents',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** Decorative background layer: never covers content, never focusable. */
export function PageDecor({ page, settings }: { page: PageKey; settings: Settings }): JSX.Element | null {
  const theme = settings.pageThemes[page];
  if (!settings.showDecorations || !theme?.decorVisible || !theme.decor) return null;
  return (
    <div
      className="decor-layer"
      aria-hidden="true"
      style={{
        backgroundImage: `url(${decorUrl(theme.decor)})`,
        opacity: theme.decorOpacity,
      }}
    />
  );
}
