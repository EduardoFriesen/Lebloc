import { NavLink } from 'react-router-dom';

export interface Tab {
  to: string;
  label: string;
  /** Active only on exactly `to` (the first tab, whose path the others extend). */
  end?: boolean;
}

/** A screen's sections as links: each has its own URL, so "back" returns to the one you were on. */
export function TabNav({ label, tabs, search }: { label: string; tabs: readonly Tab[]; search?: string }) {
  return (
    <nav aria-label={label} className="flex gap-6">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={{ pathname: tab.to, search }}
          end={tab.end}
          className={({ isActive }) =>
            `-mb-px border-b-2 px-1 pb-2 font-display text-lg transition-colors ${
              isActive ? 'border-accent text-ink' : 'border-transparent text-ink-soft hover:text-ink'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
