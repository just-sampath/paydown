import { CalendarClock, Gauge, HelpCircle, Landmark, Settings, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { classNames } from '../utils/classNames';

export type PageId = 'dashboard' | 'schedule' | 'rates' | 'parts' | 'whatif' | 'settings';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'schedule', label: 'Amortization', icon: CalendarClock },
  { id: 'rates', label: 'Rate changes', icon: TrendingDown },
  { id: 'parts', label: 'Part payments', icon: Landmark },
  { id: 'whatif', label: 'What-if', icon: HelpCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
] satisfies Array<{ id: PageId; label: string; icon: typeof Gauge }>;

const pageCopy: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Your loan, at a glance' },
  schedule: { title: 'Amortization schedule', subtitle: 'Every payment, every month' },
  rates: { title: 'Floating rate changes', subtitle: 'Track every rate revision and its impact' },
  parts: { title: 'Part payments', subtitle: 'Lump sums that shave months off your tenure' },
  whatif: { title: 'What-if simulator', subtitle: 'See how changes would affect your payoff' },
  settings: { title: 'Settings', subtitle: 'Loan parameters and computation strategy' },
};

type AppLayoutProps = {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  loanLabel: string;
  loanDetail: string;
  children: ReactNode;
};

/**
 * Renders the persistent sidebar, topbar, and page content region.
 *
 * @param props - Layout props.
 * @param props.activePage - Currently active page id.
 * @param props.onNavigate - Navigation callback for sidebar buttons.
 * @param props.loanLabel - Name and size of the active loan for the sidebar footer.
 * @param props.loanDetail - Secondary line for the sidebar footer.
 * @param props.children - Active page element.
 * @returns App layout element.
 */
export function AppLayout({
  activePage,
  onNavigate,
  loanLabel,
  loanDetail,
  children,
}: AppLayoutProps) {
  const copy = pageCopy[activePage];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">PA</div>
          <div className="brand-text">
            <div className="font-bold leading-tight">Paydown</div>
            <div className="subtle text-xs">Loan tracker</div>
          </div>
        </div>
        <nav className="py-4" aria-label="Primary navigation">
          <div className="label mb-3 px-6 nav-label">Workspace</div>
          {navItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              selected={activePage === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="label">Active loan</div>
          <div className="mt-2 font-bold">{loanLabel}</div>
          {loanDetail && <div className="subtle text-xs">{loanDetail}</div>}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="m-0 text-2xl font-extrabold">{copy.title}</h1>
            <p className="subtle m-0 mt-1 text-sm">{copy.subtitle}</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

type NavButtonProps = {
  item: (typeof navItems)[number];
  selected: boolean;
  onClick: () => void;
};

function NavButton({ item, selected, onClick }: NavButtonProps) {
  const Icon = item.icon;

  return (
    <button
      className={classNames('nav-link', selected && 'font-bold')}
      aria-label={item.label}
      aria-current={selected ? 'page' : undefined}
      onClick={onClick}
      title={item.label}
      type="button"
    >
      <Icon size={20} />
      <span className="nav-label">{item.label}</span>
    </button>
  );
}
