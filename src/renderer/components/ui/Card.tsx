import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

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
  children?: ReactNode;
};

export function Card({ title, to, onSelect, subtitle, badges, actions, muted = false, children }: CardProps) {
  return (
    <li>
      <article
        className={`relative flex h-full flex-col gap-3 rounded-2xl p-5 shadow-warm transition-[translate,box-shadow] hover:-translate-y-0.5 hover:ring-2 hover:ring-ochre/50 ${FOCUS_WITHIN} ${
          muted ? 'bg-sunken/70' : 'bg-surface'
        }`}
      >
        <div>
          <h3 className="font-display text-xl font-semibold leading-tight">
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
        {badges && <div className="flex flex-wrap gap-1.5">{badges}</div>}
        {actions && <div className="relative z-10 mt-auto flex flex-wrap gap-2 pt-1">{actions}</div>}
      </article>
    </li>
  );
}

const BADGE_TONES = {
  neutral: 'bg-sunken text-ink-soft',
  debt: 'bg-accent/15 text-accent-ink',
  warning: 'bg-ochre text-night',
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
