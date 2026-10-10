import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PassStatus } from '../../../shared/types';

/**
 * Stretches a link or button over its nearest `relative` ancestor, so tapping anywhere on the card
 * or row opens it, with a single tab stop and the title as accessible name. The ancestor draws the
 * focus ring (`FOCUS_WITHIN`).
 */
export const STRETCHED = 'text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-[""] focus-visible:outline-none';
export const FOCUS_WITHIN =
  'has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-solid';

export function CardGrid({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
      {children}
    </ul>
  );
}

type CardTarget = { to: string; onSelect?: never } | { onSelect: () => void; to?: never };

type CardProps = CardTarget & {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  /** Buttons that do something else than opening the card; they sit above the stretched link. */
  actions?: ReactNode;
  /** Archived or inactive items. */
  muted?: boolean;
  /** Tints the card by how many passes are left: mustard when low, brick when none. */
  tone?: PassStatus;
  /** Thin full-width row: title and details on the left, actions on the right. */
  strip?: boolean;
  children?: ReactNode;
};

const TONE_CLASSES: Record<PassStatus, string> = {
  ok: 'bg-surface',
  low: 'border-l-4 border-ochre bg-[color-mix(in_srgb,var(--color-ochre)_15%,var(--color-surface))]',
  none: 'border-l-4 border-danger bg-[color-mix(in_srgb,var(--color-danger)_10%,var(--color-surface))]',
};

export function Card({ title, to, onSelect, subtitle, badges, actions, muted = false, tone = 'ok', strip = false, children }: CardProps) {
  const background = muted ? 'bg-sunken/70' : TONE_CLASSES[tone];
  // Strip: details | badges (wrap among themselves) | actions (never wrap below).
  const layout = strip
    ? 'grid grid-cols-[minmax(13rem,1fr)_auto_auto] items-center gap-x-4 px-5 py-3'
    : 'flex h-full flex-col gap-3 p-5 hover:-translate-y-0.5';
  return (
    <li>
      <article
        className={`relative rounded-2xl shadow-warm transition-[translate,box-shadow] hover:ring-2 hover:ring-ochre/50 ${layout} ${FOCUS_WITHIN} ${background}`}
      >
        <div className={strip ? 'min-w-0' : ''}>
          <h3 className={`font-display font-semibold leading-tight ${strip ? 'text-lg' : 'text-xl'}`}>
            {to !== undefined ? (
              <Link to={to} className={STRETCHED}>
                {title}
              </Link>
            ) : (
              <button type="button" onClick={onSelect} className={`cursor-pointer ${STRETCHED}`}>
                {title}
              </button>
            )}
          </h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {children}
        {strip ? (
          <div className="flex flex-wrap justify-end gap-1.5">{badges}</div>
        ) : (
          badges && <div className="flex flex-wrap gap-1.5">{badges}</div>
        )}
        {actions && <div className={`relative z-10 flex flex-wrap gap-2 ${strip ? '' : 'mt-auto pt-1'}`}>{actions}</div>}
      </article>
    </li>
  );
}

const BADGE_TONES = {
  neutral: 'bg-sunken text-ink-soft',
  debt: 'bg-accent/15 text-accent-ink',
  warning: 'bg-ochre text-night',
  danger: 'bg-danger text-canvas',
} as const;

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE_TONES[tone]}`}>{children}</span>;
}

/** Big number with a small label above, for counts and amounts inside a card. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className="font-display text-2xl leading-tight">{children}</dd>
    </div>
  );
}

/** "Pocos pases" / "Sin pases" message that goes with the card tone; nothing when there are enough. */
export function PassBadge({ status }: { status: PassStatus }) {
  if (status === 'low') return <Badge tone="warning">Pocos pases</Badge>;
  if (status === 'none') return <Badge tone="danger">Sin pases</Badge>;
  return null;
}
