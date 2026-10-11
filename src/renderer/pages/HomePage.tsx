import { type ReactNode, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { ClientSummary, Dashboard, DashboardSummary } from '../../shared/types';
import { DayMovementsTable } from '../components/DayMovementsTable';
import { KioskSalePanel } from '../components/KioskSalePanel';
import { WalkInButtons } from '../components/WalkInButtons';
import { Button } from '../components/ui/Button';
import { Badge, Card, FOCUS_WITHIN, PassBadge, STRETCHED } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { PagedList } from '../components/ui/Pager';
import { SUMMARY_LIST, SUMMARY_SIDE, SUMMARY_TOP, WITH_SUMMARY } from '../components/ui/SummaryTable';
import { Stripe } from '../components/ui/Stripe';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { debtLabel, formatMoney, fullName, PASS_KIND_LABELS, waiverLabel } from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';
import { NewClientDialog } from './ClientForm';

// Section heading that stays at the top of the scrolling column while its section scrolls under it.
const STICKY = 'paper sticky -top-2 z-20 py-2';

export function HomePage() {
  const pasesId = useId();
  const kioskId = useId();
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const kioskPanel = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = search.trim();
  const dashboard = useAsync(() => call('dashboard:get', {}), []);
  const movements = useAsync(() => call('counter:today', {}), []);
  const usual = useAsync(() => call('counter:usual', {}), []);
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
      // Whoever just came drops out of the preload; colors and renewals follow the new count.
      results.reload();
      usual.reload();
      dashboard.reload();
    } catch (caught) {
      setNotice({ tone: 'error', text: `${fullName(client)}: ${errorMessage(caught)}` });
    } finally {
      setBusy(false);
    }
  }

  function refreshIncome() {
    dashboard.reload();
    movements.reload();
  }

  const strip = (client: ClientSummary) => <ClientStrip key={client.id} client={client} busy={busy} onConsume={consume} />;

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader title="Mostrador" subtitle="Buscá al cliente y marcá el pase que usa." />
        <NewClientDialog open={creating} onClose={() => setCreating(false)} />
      </div>
      {/* The scroll padding keeps focused or scrolled-to rows out from under the sticky headings. */}
      <div className={`${SUMMARY_LIST} flex flex-col gap-6 lg:scroll-pt-40`}>
        <section aria-labelledby={pasesId} className="flex flex-col gap-6">
          <h2 id={pasesId} className={`${STICKY} font-display text-2xl font-semibold`}>
            Pases
          </h2>
          <div className="-mt-5 flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm">
              <TextField
                label="Buscar cliente"
                type="search"
                autoFocus
                placeholder="Nombre o apellido"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <WalkInButtons onSold={refreshIncome} />
          </div>
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          {query ? (
            <ListSection title="Resultados">
              <AsyncView
                state={results}
                isEmpty={(data) => data.length === 0}
                empty={
                  <EmptyState title="Sin resultados">
                    <button type="button" className="underline" onClick={() => setCreating(true)}>
                      Crear cliente
                    </button>
                  </EmptyState>
                }
              >
                {(clients) => <PagedList key={query} items={clients} label="Resultados" render={strip} />}
              </AsyncView>
            </ListSection>
          ) : (
            <ListSection title="Recomendados">
              <AsyncView
                state={usual}
                isEmpty={(data) => data.length === 0}
                empty={<p className="text-sm text-ink-soft">Nadie más de la semana pasada a esta hora. Buscá al cliente por nombre.</p>}
              >
                {(clients) => <PagedList items={clients} label="Recomendados" render={strip} />}
              </AsyncView>
            </ListSection>
          )}
        </section>
        <Stripe />
        <section aria-labelledby={kioskId} className="flex flex-col gap-6">
          <div className={`${STICKY} flex flex-col gap-3`}>
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
            <KioskSalePanel search={productSearch} onSearchChange={setProductSearch} onSold={refreshIncome} />
          </div>
          <DayMovementsTable state={movements} onChanged={refreshIncome} />
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

interface ClientStripProps {
  client: ClientSummary;
  busy: boolean;
  onConsume: (client: ClientSummary, kind: PassKind) => Promise<void>;
}

/** Thin full-width card: tinted by passes left, opens the client, and marks a pass from the buttons. */
function ClientStrip({ client, busy, onConsume }: ClientStripProps) {
  const name = fullName(client);
  const flagged = client.passStatus !== 'ok' || client.debtCents > 0 || client.waiver.state !== 'valid';
  return (
    <Card
      strip
      tone={client.passStatus}
      to={`/clientes/${client.id}`}
      title={name}
      subtitle={`Libres: ${client.remainingFree} · Con profesor: ${client.remainingTeacher}`}
      badges={
        flagged && (
          <>
            <PassBadge status={client.passStatus} />
            {client.debtCents > 0 && <Badge tone="debt">{debtLabel(client)}</Badge>}
            {client.waiver.state !== 'valid' && <Badge tone="warning">{waiverLabel(client.waiver)}</Badge>}
          </>
        )
      }
      actions={
        <>
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
        </>
      }
    />
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
