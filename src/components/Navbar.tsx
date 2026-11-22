import { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import type { AuthenticatedUser } from '../utils/authValidation';

export type PublicNavTab = 'home' | 'features' | 'contact';
export type ScadaNavTab = 'operator' | 'supervisor' | 'system-health' | 'manual-fallback';
export type NavTab = PublicNavTab | ScadaNavTab;

interface NavbarProps {
  mode: 'public' | 'scada';
  activeTab: NavTab;
  user: AuthenticatedUser | null;
  manualFallbackActive?: boolean;
  onSelectTab: (tab: NavTab) => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

const PUBLIC_NAV_ITEMS: readonly { id: PublicNavTab; label: string; href: string }[] = [
  { id: 'home', label: 'Home', href: '#/' },
  { id: 'features', label: 'Features', href: '#/#features' },
  { id: 'contact', label: 'Contact Us', href: '#/#contact' },
];

const SCADA_NAV_ITEMS: readonly { id: ScadaNavTab; label: string; href: string }[] = [
  { id: 'operator', label: 'Operator Dashboard', href: '#/operator' },
  { id: 'supervisor', label: 'Supervisor Dashboard', href: '#/supervisor' },
  { id: 'system-health', label: 'System Health', href: '#/system-health' },
  { id: 'manual-fallback', label: 'Manual Fallback', href: '#/manual-fallback' },
];

export function Navbar({
  mode,
  activeTab,
  user,
  manualFallbackActive = false,
  onSelectTab,
  onOpenAuth,
  onSignOut,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isScada = mode === 'scada';
  const navItems = isScada ? SCADA_NAV_ITEMS : PUBLIC_NAV_ITEMS;

  const handleNavClick = (tab: NavTab) => {
    setMobileMenuOpen(false);
    onSelectTab(tab);
  };

  return (
    <header
      data-nav-mode={mode}
      className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.12] bg-[#0B0C0D]/72 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.2)] transition-colors duration-200"
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-6 lg:px-12">
        {/* Zone 1: Supplied KILNOVA logo + Single-line architectural wordmark */}
        <a
          href={isScada ? '#/operator' : '#/'}
          onClick={(e) => {
            e.preventDefault();
            handleNavClick(isScada ? 'operator' : 'home');
          }}
          className="inline-flex items-center gap-2.5 font-display text-lg font-semibold tracking-[0.22em] text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B82F6]"
        >
          <img
            src="/assets/kilnova-logo-dark.png"
            alt="KILNOVA logo"
            className="h-7 w-auto object-contain"
          />
          <span>KILNOVA</span>
        </a>

        {/* Zone 2: Centered original underline navigation (strictly separated Public vs Operational) */}
        <nav
          aria-label={isScada ? 'Operational KILNOVA navigation' : 'Public website navigation'}
          className="hidden md:flex items-center gap-8 text-[13px] font-medium tracking-[0.04em]"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isFallbackAlert = item.id === 'manual-fallback' && manualFallbackActive;
            return (
              <a
                key={item.id}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(item.id);
                }}
                className={`relative py-1.5 whitespace-nowrap shrink-0 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B82F6] after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:transition-all after:duration-200 ${
                  isFallbackAlert
                    ? 'text-[#FCA5A5] after:bg-[#EF4444] after:w-full font-semibold'
                    : isActive
                      ? 'text-white after:bg-[#3B82F6] after:w-full'
                      : 'text-[#CBD5E1] hover:text-white after:bg-[#3B82F6] after:w-0 hover:after:w-full'
                }`}
              >
                {item.label}
                {isFallbackAlert ? ' (ACTIVE)' : ''}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Original Login / Register action (plus Open Platform on public site) */}
        <div className="flex items-center gap-3 shrink-0">
          {!isScada && (
            <button
              type="button"
              onClick={() => handleNavClick('operator')}
              className="hidden sm:inline-flex min-h-[38px] items-center justify-center rounded-full border border-white/20 bg-white/[0.08] px-4 py-1.5 text-xs font-medium tracking-[0.04em] text-white whitespace-nowrap shrink-0 transition-colors hover:border-[#3B82F6] hover:bg-[#1D64D8] cursor-pointer"
            >
              Open Platform
            </button>
          )}

          {user ? (
            <div className="hidden sm:flex items-center gap-3">
              <span className="max-w-[160px] truncate text-xs font-medium text-white">
                {user.fullName}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.08] px-4 py-1.5 text-xs font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:border-[#3B82F6] hover:bg-[#1D64D8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="hidden sm:inline-flex min-h-[38px] items-center justify-center rounded-full border border-[#3B82F6]/65 bg-[#1D64D8]/25 px-5 py-2 text-xs font-medium tracking-[0.04em] text-white whitespace-nowrap shrink-0 transition-all duration-200 hover:border-[#3B82F6] hover:bg-[#1D64D8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] cursor-pointer"
            >
              Login / Register
            </button>
          )}

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center text-white md:hidden focus-visible:outline-2 focus-visible:outline-[#3B82F6] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="border-t border-white/[0.1] bg-[#0B0C0D]/92 px-6 py-5 backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-3">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavClick(item.id);
                  }}
                  className={`py-2 text-sm font-medium transition-colors ${
                    isActive ? 'text-white' : 'text-[#CBD5E1] hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}

            {!isScada && (
              <button
                type="button"
                onClick={() => handleNavClick('operator')}
                className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/20 bg-white/[0.08] px-4 py-2.5 text-xs font-semibold tracking-[0.05em] text-white cursor-pointer"
              >
                Open Platform
              </button>
            )}

            {user ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignOut();
                }}
                className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.08] px-4 py-2.5 text-xs font-semibold tracking-[0.05em] text-white transition-colors hover:border-[#3B82F6] cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out ({user.fullName})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#1D64D8] px-4 py-2.5 text-xs font-semibold tracking-[0.05em] text-white transition-colors hover:bg-[#1E40AF] cursor-pointer"
              >
                Login / Register
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
