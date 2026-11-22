/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Navbar, type NavTab } from './components/Navbar';
import { HeroDissolution } from './components/HeroDissolution';
import { HomeSections } from './components/HomeSections';
import { OperatorDashboardPage } from './components/OperatorDashboardPage';
import { SupervisorDashboardPage } from './components/SupervisorDashboardPage';
import { SystemHealthPage } from './components/SystemHealthPage';
import { ManualFallbackPage } from './components/ManualFallbackPage';
import { AuthModal } from './components/AuthModal';
import { KilnovaFloatingAssistant } from './components/KilnovaFloatingAssistant';
import { KilnovaAssistantProvider } from './context/KilnovaAssistantContext';
import { COPY_BY_LOCALE } from './theme/themeConfig';
import {
  auth,
  loadUserPersistedRagEntries,
  signOutGoogle,
} from './lib/firebase';
import type { AuthenticatedUser, UserRole } from './utils/authValidation';

type AppPage = 'home' | 'operator' | 'supervisor' | 'system-health' | 'manual-fallback';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] p-6 text-[#F1F5F9]">
          <div className="max-w-md rounded-xl border border-[#EF4444]/60 bg-[#111827] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#FCA5A5]">
              KILNOVA Runtime Recovery
            </p>
            <h1 className="mt-2 font-display text-xl font-semibold">
              A component encountered an unexpected state.
            </h1>
            <p className="mt-2 text-xs text-[#94A3B8]">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-[42px] rounded-lg bg-[#1D64D8] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Reload Console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function resolvePageFromLocation(): AppPage {
  const hash = window.location.hash.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  if (hash.includes('operator') || path === '/operator') return 'operator';
  if (hash.includes('supervisor') || path === '/supervisor') return 'supervisor';
  if (hash.includes('system-health') || path === '/system-health') return 'system-health';
  if (hash.includes('manual-fallback') || path === '/manual-fallback') return 'manual-fallback';
  return 'home';
}

export default function App() {
  const [page, setPage] = useState<AppPage>(() => resolvePageFromLocation());
  const [homeNavActive, setHomeNavActive] = useState<'home' | 'features' | 'contact'>('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialRole, setAuthInitialRole] = useState<UserRole>('operator');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [manualFallbackActive, setManualFallbackActive] = useState(false);

  const copy = COPY_BY_LOCALE.en;

  useEffect(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  }, []);

  useEffect(() => {
    document.body.style.backgroundColor = page === 'home' ? '#0B0C0D' : '#F1F5F9';
  }, [page]);

  // Keep Firebase Google auth state in sync & hydrate any saved RAG entries into the server session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setUser((prev) => ({
          fullName: fbUser.displayName || prev?.fullName || fbUser.email || 'Plant Engineer',
          email: fbUser.email || prev?.email || '',
          role: prev?.role || 'supervisor',
        }));

        // Hydrate any user-saved Firestore RAG documents/incidents into the backend vector engine
        void loadUserPersistedRagEntries()
          .then(async (entries) => {
            for (const docItem of entries.documents as Array<Record<string, unknown>>) {
              await fetch('/api/rag/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(docItem),
              }).catch(() => {});
            }
            for (const incItem of entries.incidents as Array<Record<string, unknown>>) {
              await fetch('/api/rag/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(incItem),
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync browser back/forward hash navigation
  useEffect(() => {
    const onHashChange = () => {
      setPage(resolvePageFromLocation());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Track active section on public website homepage
  useEffect(() => {
    if (page !== 'home') return;
    const onScroll = () => {
      const contactEl = document.getElementById('contact');
      const featuresEl = document.getElementById('features');
      if (contactEl && contactEl.getBoundingClientRect().top <= window.innerHeight * 0.45) {
        setHomeNavActive('contact');
      } else if (featuresEl && featuresEl.getBoundingClientRect().top <= window.innerHeight * 0.45) {
        setHomeNavActive('features');
      } else {
        setHomeNavActive('home');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [page]);

  const navigateToPage = useCallback((nextPage: AppPage, anchor?: 'features' | 'contact') => {
    setPage(nextPage);
    const targetHash =
      nextPage === 'operator'
        ? '#/operator'
        : nextPage === 'supervisor'
          ? '#/supervisor'
          : nextPage === 'system-health'
            ? '#/system-health'
            : nextPage === 'manual-fallback'
              ? '#/manual-fallback'
              : anchor
                ? `#/#${anchor}`
                : '#/';
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, '', targetHash);
    }

    if (nextPage === 'home' && anchor) {
      setHomeNavActive(anchor);
      window.requestAnimationFrame(() => {
        const el = document.getElementById(anchor);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      setHomeNavActive('home');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  const handleSelectNavTab = useCallback(
    (tab: NavTab) => {
      if (tab === 'operator') {
        navigateToPage('operator');
      } else if (tab === 'supervisor') {
        navigateToPage('supervisor');
      } else if (tab === 'system-health') {
        navigateToPage('system-health');
      } else if (tab === 'manual-fallback') {
        navigateToPage('manual-fallback');
      } else if (tab === 'features') {
        navigateToPage('home', 'features');
      } else if (tab === 'contact') {
        navigateToPage('home', 'contact');
      } else {
        navigateToPage('home');
      }
    },
    [navigateToPage]
  );

  const handleOpenAuth = useCallback((role: UserRole = 'operator') => {
    setAuthInitialRole(role);
    setAuthOpen(true);
  }, []);

  const handleAuthenticated = useCallback(
    (authenticatedUser: AuthenticatedUser) => {
      setUser(authenticatedUser);
      setAuthOpen(false);
      navigateToPage(authenticatedUser.role);
    },
    [navigateToPage]
  );

  const handleSignOut = useCallback(() => {
    void signOutGoogle().catch(() => {});
    setUser(null);
  }, []);

  const navMode: 'public' | 'scada' = page === 'home' ? 'public' : 'scada';
  const activeNavTab: NavTab = page === 'home' ? homeNavActive : page;

  return (
    <AppErrorBoundary>
      <KilnovaAssistantProvider>
        <div dir="ltr" data-active-page={page} className="min-h-screen">
        <Navbar
          mode={navMode}
          activeTab={activeNavTab}
          user={user}
          manualFallbackActive={manualFallbackActive}
          onSelectTab={handleSelectNavTab}
          onOpenAuth={() => handleOpenAuth(page === 'supervisor' ? 'supervisor' : 'operator')}
          onSignOut={handleSignOut}
        />

        {page === 'home' && (
          <main>
            {/* Existing Hero Section — Preserved Exactly (Rock Animation & Text Unchanged) */}
            <HeroDissolution
              copy={copy.hero}
              onOpenOperator={() => navigateToPage('operator')}
              onOpenSupervisor={() => navigateToPage('supervisor')}
            />

            <HomeSections
              onOpenOperator={() => navigateToPage('operator')}
              onOpenSupervisor={() => navigateToPage('supervisor')}
              onOpenAuth={() => handleOpenAuth('operator')}
              onScrollTop={() => navigateToPage('home')}
            />
          </main>
        )}

        {page === 'operator' && (
          <OperatorDashboardPage
            manualFallbackActive={manualFallbackActive}
            onOpenManualFallback={() => navigateToPage('manual-fallback')}
          />
        )}

        {page === 'supervisor' && (
          <SupervisorDashboardPage
            onOpenSystemHealth={() => navigateToPage('system-health')}
          />
        )}

        {page === 'system-health' && <SystemHealthPage />}

        {page === 'manual-fallback' && (
          <ManualFallbackPage
            manualFallbackActive={manualFallbackActive}
            onToggleManualFallback={setManualFallbackActive}
          />
        )}

        <AuthModal
          open={authOpen}
          initialRole={authInitialRole}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={handleAuthenticated}
        />

        <KilnovaFloatingAssistant visible={page === 'operator' || page === 'supervisor'} />
        </div>
      </KilnovaAssistantProvider>
    </AppErrorBoundary>
  );
}
