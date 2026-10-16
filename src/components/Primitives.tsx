import type { ReactNode } from 'react';

type CardProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Renders a dashboard card with an optional heading area.
 *
 * @param props - Card props.
 * @param props.eyebrow - Small uppercase label above the title.
 * @param props.title - Card title.
 * @param props.subtitle - Supporting card text.
 * @param props.action - Optional header action element.
 * @param props.children - Card body content.
 * @param props.className - Additional CSS classes.
 * @returns Card element.
 */
export function Card({ eyebrow, title, subtitle, action, children, className = '' }: CardProps) {
  const hasHeader = eyebrow !== undefined || title !== undefined || action !== undefined;

  return (
    <section className={`card ${className}`}>
      {hasHeader && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <div className="label mb-1">{eyebrow}</div>}
            {title && <h2 className="m-0 text-lg font-extrabold">{title}</h2>}
            {subtitle && <p className="subtle m-0 mt-1 text-sm">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  progress?: number;
};

/**
 * Renders a compact KPI tile.
 *
 * @param props - Stat card props.
 * @param props.label - Uppercase stat label.
 * @param props.value - Main stat value.
 * @param props.detail - Optional secondary line.
 * @param props.icon - Optional label icon.
 * @param props.progress - Optional progress percentage from 0 to 100.
 * @returns KPI tile element.
 */
export function StatCard({ label, value, detail, icon, progress }: StatCardProps) {
  return (
    <div className="kpi">
      <div className="label flex items-center gap-2">
        {icon}
        {label}
      </div>
      <div className="value mt-2">{value}</div>
      {progress !== undefined && (
        <div className="progress-track mt-3">
          <div
            className="progress-fill"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
      {detail && <div className="subtle mt-2 text-xs font-semibold">{detail}</div>}
    </div>
  );
}

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  hint: string;
};

/**
 * Renders an empty state panel.
 *
 * @param props - Empty state props.
 * @param props.icon - Visual icon element.
 * @param props.title - Primary empty state text.
 * @param props.hint - Secondary empty state hint.
 * @returns Empty state element.
 */
export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>
        <div className="mb-3 flex justify-center text-[var(--ink-4)]">{icon}</div>
        <div className="font-bold">{title}</div>
        <div className="subtle mt-1 text-sm">{hint}</div>
      </div>
    </div>
  );
}
