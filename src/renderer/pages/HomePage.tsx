import { type ReactNode, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { ClientSummary, Dashboard, DashboardSummary } from '../../shared/types';
import { DayEntriesTable } from '../components/DayEntriesTable';
import { DayMovementsTable } from '../components/DayMovementsTable';
import { KioskSalePanel } from '../components/KioskSalePanel';
import { WalkInButtons } from '../components/WalkInButtons';
import { Button } from '../components/ui/Button';
import { Badge, Card, FOCUS_WITHIN, PassBadge, STRETCHED } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { PagedList } from '../components/ui/Pager';
import { STICKY_HEADING, SUMMARY_LIST, SUMMARY_SIDE, SUMMARY_TOP, WITH_SUMMARY } from '../components/ui/SummaryTable';
import { Stripe } from '../components/ui/Stripe';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { debtLabel, formatMoney, fullName, PASS_KIND_LABELS, waiverLabel } from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { type AsyncResult, useAsync } from '../lib/useAsync';
import { NewClientDialog } from './ClientForm';

export function HomePage() {
  const pasesId = useId();
  const kioskId = useId();
  const [search, setSearch] = useState('');
  // Escape, a click outside or a failed pass close the results; typing or clicking the box opens them again.
  const [dismissed, setDismissed] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const [productSearch, setProductSearch] = useState('');
  const kioskPanel = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = search.trim();
  const open = query !== '' && !dismissed;
  const dashboard = useAsync(() => call('dashboard:get', {}), []);
  const movements = useAsync(() => call('counter:today', {}), []);
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

  // Passes, walk-ins and voids touch the entries, the cash, the colors of the results and the renewals at once.
  function refresh() {
    dashboard.reload();
    movements.reload();
    entries.reload();
    results.reload();
  }

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader title="Mostrador" subtitle="Buscá al cliente y marcá el pase que usa." />
        <NewClientDialog open={creating} onClose={() => setCreating(false)} />
      </div>
      {/* The scroll padding keeps focused or scrolled-to rows out from under the sticky headings. */}
      <div className={`${SUMMARY_LIST} flex flex-col gap-6 @summary/main:scroll-pt-40`}>
        <section aria-labelledby={pasesId} className="flex flex-col gap-6">
          <h2 id={pasesId} className={`${STICKY_HEADING} font-display text-2xl font-semibold`}>
            Pases
          </h2>
          <div className="-mt-5 flex flex-wrap items-end gap-3">
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
              {open && (
                <SearchResults id={resultsId} state={results} busy={busy} onConsume={consume} onCreate={() => setCreating(true)} />
              )}
            </div>
            <WalkInButtons onSold={refresh} />
          </div>
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          <ListSection title="Ingresos de hoy">
            <DayEntriesTable state={entries} onChanged={refresh} />
          </ListSection>
        </section>
        <Stripe />
        <section aria-labelledby={kioskId} className="flex flex-col gap-6">
          <div className={`${STICKY_HEADING} flex flex-col gap-3`}>
            <h2 id={kioskId} className="font-display text-2xl font-semibold">
              Kiosco
            </h2>
            <TextField
              label="Buscar producto"
              type="search"
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                // Typing from down in the movements: bring the matches (right under this sticky header) into view.
                kioskPanel.current?.scrollIntoView({ block: 'nearest' });
              }}
            />
          </div>
          <div ref={kioskPanel}>
            <KioskSalePanel search={productSearch} onSearchChange={setProductSearch} onSold={refresh} />
          </div>
          <DayMovementsTable state={movements} onChanged={refresh} />
        </section>
      </div>
      <aside aria-label="Alertas" className={`${SUMMARY_SIDE} flex flex-col gap-6`}>
        <AsyncView state={dashboard} skeleton={<SkeletonRows rows={6} />}>
          {(data) => <DashboardPanels dashboard={data} />}
        </AsyncView>
      </aside>
    </section>
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
          <PassBadge status={client.passStatus} />
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
        <AlertRow to="/clientes?pases=1" name="Clientes con pases">
          <span className={value}>{summary.activeClients}</span>
        </AlertRow>
        <AlertRow to="/clientes?deuda=1" name="Deudores">
          <span>
            {summary.debtorCount > 0 && <span className="text-sm text-accent-ink">{formatMoney(summary.debtTotalCents)} · </span>}
            <span className={value}>{summary.debtorCount}</span>
          </span>
        </AlertRow>
        <AlertRow to="/kiosco" name="Kiosco hoy">
          <span>
            {summary.kioskTodayCount > 0 && <span className="text-sm text-accent-ink">{formatMoney(summary.kioskTodayCents)} · </span>}
            <span className={value}>{summary.kioskTodayCount}</span>
          </span>
        </AlertRow>
        <AlertRow to="/clientes?fichas=1" name="Fichas por actualizar">
          <span className={value}>{summary.pendingWaivers}</span>
        </AlertRow>
        <AlertRow to="/profesores" name="Saldo con profesores">
          <span className={`${value} ${summary.teacherBalanceCents < 0 ? 'text-danger' : ''}`}>{formatMoney(summary.teacherBalanceCents)}</span>
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
      <Panel title="Tienen que renovar">
        {dashboard.renewals.length === 0 ? (
          <p className="text-sm text-ink-soft">Nadie que haya venido este mes se está quedando sin pases.</p>
        ) : (
          <PagedList items={dashboard.renewals} label="Tienen que renovar" render={(client) => <RenewalStrip key={client.id} client={client} />} />
        )}
      </Panel>
    </>
  );
}

/** Compact tinted card for the side panel: no pass buttons (they don't fit); it opens the client to renew. */
function RenewalStrip({ client }: { client: ClientSummary }) {
  return (
    <Card
      strip
      tone={client.passStatus}
      to={`/clientes/${client.id}`}
      title={fullName(client)}
      subtitle={`Libres: ${client.remainingFree} · Con profesor: ${client.remainingTeacher}`}
      badges={<PassBadge status={client.passStatus} />}
    />
  );
}
