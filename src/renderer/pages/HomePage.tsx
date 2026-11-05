import { type ReactNode, useId, useRef, useState } from 'react';
import { Link, Outlet, useOutletContext } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { ClientSummary, Dashboard, DashboardSummary } from '../../shared/types';
import { DayEntriesTable } from '../components/DayEntriesTable';
import { DayMovementsTable } from '../components/DayMovementsTable';
import { WalkInButtons } from '../components/WalkInButtons';
import { Button } from '../components/ui/Button';
import { Badge, Card, FOCUS_WITHIN, PassBadge, STRETCHED } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { PagedList } from '../components/ui/Pager';
import { SUMMARY_LIST, SUMMARY_SIDE, SUMMARY_TOP, WITH_SUMMARY } from '../components/ui/SummaryTable';
import { TabNav } from '../components/ui/TabNav';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { debtLabel, formatDate, formatMoney, fullName, PASS_KIND_LABELS, waiverLabel } from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { type AsyncResult, useAsync } from '../lib/useAsync';
import { NewClientDialog } from './ClientForm';

/** What the tabs get from the page: the side panel reloads after a pass, a walk-in or a void. */
interface PassesContext {
  refreshDashboard: () => void;
}

const TABS = [
  { to: '/pases', label: 'Pases', end: true },
  { to: '/pases/movimientos', label: 'Movimientos' },
] as const;

/** Header, tabs and the side panel (summary and today's debtors); the open tab goes in between. */
export function HomePage() {
  const dashboard = useAsync(() => call('dashboard:get', {}), []);
  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader title="Pases" subtitle="Buscá al cliente y marcá el pase que usa." />
        <div className="mb-4 border-b border-ink/10">
          <TabNav label="Secciones de pases" tabs={TABS} />
        </div>
      </div>
      {/* The scroll padding keeps focused or scrolled-to rows out from under the sticky headings. */}
      <div className={`${SUMMARY_LIST} flex flex-col gap-6 @summary/main:scroll-pt-40`}>
        <Outlet context={{ refreshDashboard: dashboard.reload } satisfies PassesContext} />
      </div>
      <aside aria-label="Alertas" className={`${SUMMARY_SIDE} flex flex-col gap-6`}>
        <AsyncView state={dashboard} skeleton={<SkeletonRows rows={6} />}>
          {(data) => <DashboardPanels dashboard={data} />}
        </AsyncView>
      </aside>
    </section>
  );
}

/** Find the client and mark the pass; walk-ins; and who came in today. */
export function PassesTab() {
  const { refreshDashboard } = useOutletContext<PassesContext>();
  const [search, setSearch] = useState('');
  // Escape, a click outside or a failed pass close the results; typing or clicking the box opens them again.
  const [dismissed, setDismissed] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = search.trim();
  const open = query !== '' && !dismissed;
  const entries = useAsync(() => call('counter:entries', {}), []);
  const results = useAsync(
    () => (query ? call('clients:list', { search: query, includeArchived: false }) : Promise.resolve([])),
    [query],
    { keepPreviousData: true },
  );

  async function consume(client: ClientSummary, kind: PassKind) {
    setBusy(true);
    try {
      await call('consumptions:create', { clientId: client.id, kind, note: null });
      setNotice({ tone: 'success', text: `${fullName(client)}: pase ${PASS_KIND_LABELS[kind].toLowerCase()} registrado.` });
      // Ready for the next one: the new entry tops the table below.
      setSearch('');
      refresh();
    } catch (caught) {
      setNotice({ tone: 'error', text: `${fullName(client)}: ${errorMessage(caught)}` });
      setDismissed(true);
    } finally {
      setBusy(false);
      searchBox.current?.focus();
    }
  }

  // Passes, walk-ins and voids touch the entries, the colors of the results and today's debtors at once.
  function refresh() {
    refreshDashboard();
    entries.reload();
    results.reload();
  }

  return (
    <section aria-label="Pases" className="flex flex-col gap-6">
      <NewClientDialog open={creating} onClose={() => setCreating(false)} />
      <div className="flex flex-wrap items-end gap-3">
        <div
          className="relative w-full max-w-xl"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setDismissed(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !open) return;
            setDismissed(true);
            searchBox.current?.focus();
          }}
        >
          <TextField
            ref={searchBox}
            label="Buscar cliente"
            type="search"
            autoFocus
            placeholder="Nombre, apellido o DNI"
            aria-expanded={open}
            aria-controls={resultsId}
            value={search}
            onClick={() => setDismissed(false)}
            onChange={(event) => {
              setSearch(event.target.value);
              setDismissed(false);
            }}
          />
          {open && <SearchResults id={resultsId} state={results} busy={busy} onConsume={consume} onCreate={() => setCreating(true)} />}
        </div>
        <WalkInButtons onSold={refresh} />
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <ListSection title="Ingresos de hoy">
        <DayEntriesTable state={entries} onChanged={refresh} />
      </ListSection>
    </section>
  );
}

/** Today's money at the counter: plan payments and walk-ins, with their voids. */
export function MovementsTab() {
  const { refreshDashboard } = useOutletContext<PassesContext>();
  const movements = useAsync(() => call('counter:today', {}), []);
  return (
    <DayMovementsTable
      state={movements}
      onChanged={() => {
        movements.reload();
        refreshDashboard();
      }}
    />
  );
}

function ListSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="font-display text-lg font-semibold text-ink-soft">
        {title}
      </h3>
      {children}
    </section>
  );
}

interface SearchResultsProps {
  id: string;
  state: AsyncResult<ClientSummary[]>;
  busy: boolean;
  onConsume: (client: ClientSummary, kind: PassKind) => Promise<void>;
  onCreate: () => void;
}

/**
 * Dropdown under the client search, over the entries table. Focusable (tabIndex -1) so a click on its padding or text
 * keeps focus inside the search and doesn't close it.
 */
function SearchResults({ id, state, busy, onConsume, onCreate }: SearchResultsProps) {
  return (
    <div
      id={id}
      tabIndex={-1}
      className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-[min(22rem,60vh)] overflow-y-auto overscroll-contain rounded-2xl bg-surface p-1.5 shadow-warm ring-1 ring-ink/10 outline-none transition-[opacity,translate] duration-150 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none"
    >
      <AsyncView
        state={state}
        skeleton={
          <div className="p-1.5">
            <SkeletonRows rows={3} />
          </div>
        }
        isEmpty={(clients) => clients.length === 0}
        empty={
          <p className="px-3 py-2.5 text-sm text-ink-soft">
            Ningún cliente coincide.{' '}
            <button type="button" className="font-semibold text-accent-ink underline" onClick={onCreate}>
              Crear cliente
            </button>
          </p>
        }
      >
        {(clients) => (
          <ul aria-label="Resultados">
            {clients.map((client) => (
              <ResultRow key={client.id} client={client} busy={busy} onConsume={onConsume} />
            ))}
          </ul>
        )}
      </AsyncView>
    </div>
  );
}

/** One client: name (opens the file), what's left and its warnings, and the two pass buttons. */
function ResultRow({ client, busy, onConsume }: Pick<SearchResultsProps, 'busy' | 'onConsume'> & { client: ClientSummary }) {
  const name = fullName(client);
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-sunken/60">
      <div className="min-w-0 flex-1">
        <Link className="font-semibold hover:underline" to={`/clientes/${client.id}`}>
          {name}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
          <span>
            Libres: {client.remainingFree} · Con profesor: {client.remainingTeacher}
          </span>
          {client.startedAt && <span className="text-sm font-semibold text-ink">Inició el {formatDate(client.startedAt)}</span>}
          <PassBadge status={client.passStatus} expiresAt={client.expiresAt} />
          {client.debtCents > 0 && <Badge tone="debt">{debtLabel(client)}</Badge>}
          {client.waiver.state !== 'valid' && <Badge tone="warning">{waiverLabel(client.waiver)}</Badge>}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button disabled={busy || client.remainingFree <= 0} aria-label={`Pase libre para ${name}`} onClick={() => void onConsume(client, 'free')}>
          Libre
        </Button>
        <Button
          variant="secondary"
          disabled={busy || client.remainingTeacher <= 0}
          aria-label={`Pase con profesor para ${name}`}
          onClick={() => void onConsume(client, 'teacher')}
        >
          Con profesor
        </Button>
      </div>
    </li>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-surface p-5 shadow-warm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={id} className="font-display text-xl font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One alert line; the whole row opens `to`, not just the name. */
function AlertRow({ to, name, children }: { to: string; name: string; children: ReactNode }) {
  return (
    <li className={`relative -mx-2 flex items-baseline justify-between gap-2 rounded-lg px-2 py-2 hover:bg-sunken/60 ${FOCUS_WITHIN}`}>
      <Link className={`font-semibold ${STRETCHED}`} to={to}>
        {name}
      </Link>
      {children}
    </li>
  );
}

/** Headline numbers; each row opens the screen with the detail. */
function SummaryPanel({ summary }: { summary: DashboardSummary }) {
  const value = 'font-display text-2xl leading-none';
  return (
    <Panel title="Resumen">
      <ul className="flex flex-col">
        <AlertRow to="/clientes?vista=pases" name="Clientes con pases">
          <span className={value}>{summary.activeClients}</span>
        </AlertRow>
        <AlertRow to="/clientes?vista=deuda" name="Deudores">
          <span>
            {summary.debtorCount > 0 && <span className="text-sm text-accent-ink">{formatMoney(summary.debtTotalCents)} · </span>}
            <span className={value}>{summary.debtorCount}</span>
          </span>
        </AlertRow>
        <AlertRow to="/clientes?vista=fichas" name="Sin ficha">
          <span className={value}>{summary.pendingWaivers}</span>
        </AlertRow>
      </ul>
    </Panel>
  );
}

function DashboardPanels({ dashboard }: { dashboard: Dashboard }) {
  return (
    <>
      {dashboard.summary.externalBackupFailed && (
        <Notice tone="warning">
          No se pudo copiar el backup fuera de esta PC, al pendrive o a Google Drive.{' '}
          <Link className="font-semibold underline" to="/ajustes">
            Revisalo en Ajustes
          </Link>
        </Notice>
      )}
      <SummaryPanel summary={dashboard.summary} />
      <Panel title="Deudores de hoy">
        {dashboard.todayDebtors.length === 0 ? (
          <p className="text-sm text-ink-soft">Nadie que vino hoy debe plata.</p>
        ) : (
          <PagedList items={dashboard.todayDebtors} label="Deudores de hoy" render={(client) => <DebtorStrip key={client.id} client={client} />} />
        )}
      </Panel>
    </>
  );
}

/** Compact card for the side panel; it opens the client to collect. */
function DebtorStrip({ client }: { client: ClientSummary }) {
  return (
    <Card
      strip
      to={`/clientes/${client.id}`}
      title={fullName(client)}
      subtitle={<span className="font-semibold text-accent-ink">{debtLabel(client)}</span>}
    />
  );
}
