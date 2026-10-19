import {
  CalendarRange,
  FlaskConical,
  HandCoins,
  LayoutDashboard,
  Percent,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type PageId = 'dashboard' | 'schedule' | 'rates' | 'parts' | 'whatif' | 'settings';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', short: 'Schedule', icon: CalendarRange },
  { id: 'rates', label: 'Rate changes', short: 'Rates', icon: Percent },
  { id: 'parts', label: 'Part payments', short: 'Parts', icon: HandCoins },
  { id: 'whatif', label: 'What-if', short: 'What-if', icon: FlaskConical },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: Settings },
] satisfies Array<{ id: PageId; label: string; short: string; icon: typeof Settings }>;

const pageCopy: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Where your loan stands today' },
  schedule: { title: 'Payment schedule', subtitle: 'Every EMI, grouped by year' },
  rates: { title: 'Rate changes', subtitle: 'Each change to your floating rate and what it did' },
  parts: { title: 'Part payments', subtitle: 'Lump sums you paid on top of the EMI' },
  whatif: { title: 'What-if', subtitle: 'Try extra payments or rate changes before you commit' },
  settings: { title: 'Settings', subtitle: 'Loan terms, appearance and data' },
};

type AppLayoutProps = {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  loanLabel: string;
  loanDetail: string;
  /** One line under the page title on phones, where the sidebar footer is hidden. */
  sampleNote?: string;
  banner?: ReactNode;
  children: ReactNode;
};

/**
 * Renders the navigation, page header, and page content region.
 *
 * On wide screens the navigation is a sidebar; on phones it becomes a labelled tab bar
 * fixed to the bottom of the screen.
 *
 * @param props - Layout props.
 * @param props.activePage - Currently active page id.
 * @param props.onNavigate - Navigation callback for the nav buttons.
 * @param props.loanLabel - Name of the active loan for the sidebar footer.
 * @param props.loanDetail - Size and first EMI of the loan, under its name.
 * @param props.sampleNote - Says the figures are made up, for phones.
 * @param props.banner - Optional notices shown under the page header.
 * @param props.children - Active page element.
 * @returns App layout element.
 */
export function AppLayout({
  activePage,
  onNavigate,
  loanLabel,
  loanDetail,
  sampleNote,
  banner,
  children,
}: AppLayoutProps) {
  const copy = pageCopy[activePage];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            PA
          </div>
          <div>
            <div className="font-bold leading-tight">Paydown</div>
            <div className="subtle text-xs">Home loan tracker</div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
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
          <div className="label">Showing</div>
          <div className="mt-1 font-bold">{loanLabel}</div>
          {loanDetail && <div className="subtle text-xs">{loanDetail}</div>}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
          {sampleNote && <p className="label topbar-note">{sampleNote}</p>}
        </header>
        {banner}
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
      className="nav-link"
      aria-current={selected ? 'page' : undefined}
      aria-label={item.label}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={20} />
      <span className="nav-full">{item.label}</span>
      <span className="nav-short" aria-hidden="true">
        {item.short}
      </span>
    </button>
  );
}
