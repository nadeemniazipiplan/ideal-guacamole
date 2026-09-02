import { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './state/AppStore';
import { useRoute } from './router';
import { Header, NavBar, OfflineFlag, QuickAdd, Toasts } from './components/AppShell';
import { PageDecor, ThemeScope } from './components/ThemeScope';
import { LockGate } from './components/LockScreen';
import { Reminders } from './components/Reminders';

const TodayPage = lazy(() => import('./pages/TodayPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const NutritionPage = lazy(() => import('./pages/NutritionPage'));
const FitnessPage = lazy(() => import('./pages/FitnessPage'));
const StudyPage = lazy(() => import('./pages/StudyPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function PageFallback(): JSX.Element {
  return (
    <div className="page" aria-busy="true">
      <div className="card">
        <div className="spinner" aria-hidden="true" />
        <p className="small muted" style={{ textAlign: 'center' }}>
          Loading this section…
        </p>
      </div>
    </div>
  );
}

function Routes({ page }: { page: string }): JSX.Element {
  switch (page) {
    case 'tasks':
      return <TasksPage />;
    case 'nutrition':
      return <NutritionPage />;
    case 'fitness':
      return <FitnessPage />;
    case 'study':
      return <StudyPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'analytics':
      return <AnalyticsPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <TodayPage />;
  }
}

function Shell(): JSX.Element {
  const { ready, error, settings } = useApp();
  const { page, navigate } = useRoute();

  if (!ready) {
    return (
      <div className="loading-screen">
        <div>
          <div className="spinner" aria-hidden="true" />
          <p>Opening your local database…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div className="card" style={{ maxWidth: 480 }}>
          <h1>Storage unavailable</h1>
          <p className="small">{error}</p>
          <p className="small muted">
            This dashboard stores everything in IndexedDB on this device. Private windows and browsers configured to
            block site data prevent that. Try a normal window, or allow site data for this page.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ThemeScope page={page} settings={settings}>
      <LockGate>
        <div className="app-shell">
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <OfflineFlag />
          <Header page={page} />
          <div className="app-body">
            <aside className="sidebar no-print">
              <NavBar page={page} navigate={navigate} variant="sidebar" />
            </aside>
            <main className="app-main" id="main-content" tabIndex={-1}>
              <div style={{ position: 'relative' }}>
                <PageDecor page={page} settings={settings} />
                <Suspense fallback={<PageFallback />}>
                  <Routes page={page} />
                </Suspense>
              </div>
            </main>
          </div>
          <NavBar page={page} navigate={navigate} variant="bottom" />
          <QuickAdd navigate={navigate} />
          <Reminders />
          <Toasts />
        </div>
      </LockGate>
    </ThemeScope>
  );
}

export default function App(): JSX.Element {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
