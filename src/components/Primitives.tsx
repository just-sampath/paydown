import type { ReactNode } from 'react';

import { classNames } from '../utils/classNames';

type CardProps = {
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Renders a content card with an optional heading area.
 *
 * @param props - Card props.
 * @param props.eyebrow - Small uppercase label above the title.
 * @param props.title - Card title.
 * @param props.subtitle - Supporting text under the title.
 * @param props.action - Optional control shown at the top right.
 * @param props.children - Card body content.
 * @param props.className - Additional CSS classes.
 * @returns Card element.
 */
export function Card({ eyebrow, title, subtitle, action, children, className }: CardProps) {
  const hasHeader = eyebrow !== undefined || title !== undefined || action !== undefined;

  return (
    <section className={classNames('card', className)}>
      {hasHeader && (
        <div className="card-head">
          <div className="min-w-0">
            {eyebrow && <div className="label">{eyebrow}</div>}
            {title !== undefined && <h2>{title}</h2>}
            {subtitle !== undefined && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'positive' | 'negative' | undefined;

type StatCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
};

/**
 * Renders a compact KPI tile.
 *
 * @param props - Stat card props.
 * @param props.label - Uppercase stat label.
 * @param props.value - Main stat value.
 * @param props.detail - Optional supporting line.
 * @param props.icon - Optional icon next to the label.
 * @param props.tone - Colours the value as good or bad news.
 * @returns KPI tile element.
 */
export function StatCard({ label, value, detail, icon, tone }: StatCardProps) {
  return (
    <div className="kpi">
      <div className="label kpi-label">
        {icon}
        {label}
      </div>
      <div className={classNames('kpi-value', toneClass(tone))}>{value}</div>
      {detail !== undefined && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  hint: ReactNode;
  children?: ReactNode;
};

/**
 * Renders an empty state panel.
 *
 * @param props - Empty state props.
 * @param props.icon - Visual icon element.
 * @param props.title - Primary empty state text.
 * @param props.hint - Secondary empty state hint.
 * @param props.children - Optional actions under the hint.
 * @returns Empty state element.
 */
export function EmptyState({ icon, title, hint, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="font-bold">{title}</div>
      <div className="subtle text-sm">{hint}</div>
      {children}
    </div>
  );
}

/**
 * Maps a tone to its text colour class.
 *
 * @param tone - Good news, bad news, or neutral.
 * @returns CSS class name, or an empty string for neutral.
 */
export function toneClass(tone: Tone): string {
  if (tone === 'positive') {
    return 'tone-positive';
  }

  return tone === 'negative' ? 'tone-negative' : '';
}

/**
 * Picks a tone from a signed saving: above zero is good, below zero is bad.
 *
 * @param saving - Months or rupees saved; negative means extra.
 * @returns Matching tone.
 */
export function toneOf(saving: number): Tone {
  if (saving > 0) {
    return 'positive';
  }

  return saving < 0 ? 'negative' : undefined;
}
