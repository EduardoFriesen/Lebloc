import { type ReactNode, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { ClientSummary, Dashboard } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Badge, Card, FOCUS_WITHIN, PassBadge, STRETCHED } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { PagedList } from '../components/ui/Pager';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { debtLabel, formatDate, formatMoney, fullName, PASS_KIND_LABELS, waiverLabel, WEEKDAY_LABELS } from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

/** Rows per alert panel, so the right column leaves room for the kiosk. */
const ALERT_ROWS = 4;

export function HomePage() {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const query = search.trim();
  const dashboard = useAsync(() => call('dashboard:get', {}), []);
  const usual = useAsync(() => call('counter:usual', {}), []);
  const results = useAsync(
    () => (query ? call('clients:list', { search: query, includeArchived: false }) : Promise.resolve([])),
    [query],
    { keepPreviousData: true },
  );
  const weekday = (WEEKDAY_LABELS[new Date().getDay()] ?? '').toLowerCase();

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

  const strip = (client: ClientSummary) => <ClientStrip key={client.id} client={client} busy={busy} onConsume={consume} />;

  return (
    <section className="grid gap-8 p-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <PageHeader title="Mostrador" subtitle="Buscá al cliente y marcá el pase que usa." />
          <TextField
            label="Buscar cliente"
            type="search"
            autoFocus
            placeholder="Nombre o apellido"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        </div>
        {query ? (
          <ListSection title="Resultados">
            <AsyncView
              state={results}
              isEmpty={(data) => data.length === 0}
              empty={
                <EmptyState title="Sin resultados">
                  <Link className="underline" to="/clientes/nuevo">
                    Crear cliente
                  </Link>
                </EmptyState>
              }
            >
              {(clients) => <PagedList key={query} items={clients} label="Resultados" render={strip} />}
            </AsyncView>
          </ListSection>
        ) : (
          <ListSection title={`Vinieron el ${weekday} pasado a esta hora`}>
            <AsyncView
              state={usual}
              isEmpty={(data) => data.length === 0}
              empty={<p className="text-sm text-ink-soft">Nadie más de la semana pasada a esta hora. Buscá al cliente por nombre.</p>}
            >
              {(clients) => <PagedList items={clients} label="Vinieron la semana pasada" render={strip} />}
            </AsyncView>
          </ListSection>
        )}
        <ListSection title="Tienen que renovar">
          <AsyncView
            state={dashboard}
            isEmpty={(data) => data.renewals.length === 0}
            empty={<p className="text-sm text-ink-soft">Nadie que haya venido este mes se está quedando sin pases.</p>}
          >
            {(data) => <PagedList items={data.renewals} label="Tienen que renovar" render={strip} />}
          </AsyncView>
        </ListSection>
      </div>
      <aside aria-label="Alertas" className="flex flex-col gap-6">
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
      <h2 id={id} className="font-display text-2xl font-semibold">
        {title}
      </h2>
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
    <li className={`relative -mx-2 flex justify-between gap-2 rounded-lg px-2 py-2 hover:bg-sunken/60 ${FOCUS_WITHIN}`}>
      <Link className={`font-semibold ${STRETCHED}`} to={to}>
        {name}
      </Link>
      {children}
    </li>
  );
}

/** First ALERT_ROWS items as rows, then "y N más". */
function AlertList<T>({ items, empty, render }: { items: readonly T[]; empty: string; render: (item: T) => ReactNode }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="flex flex-col text-sm">
      {items.slice(0, ALERT_ROWS).map(render)}
      {items.length > ALERT_ROWS && <li className="py-2 text-ink-soft">y {items.length - ALERT_ROWS} más</li>}
    </ul>
  );
}

function DashboardPanels({ dashboard }: { dashboard: Dashboard }) {
  return (
    <>
      <Panel
        title="Deudores"
        action={
          <Link className="text-sm underline" to="/clientes?deuda=1">
            Ver todos
          </Link>
        }
      >
        <AlertList
          items={dashboard.debtors}
          empty="No hay deudas pendientes."
          render={(debtor) => (
            <AlertRow key={debtor.saleId} to={`/clientes/${debtor.clientId}`} name={debtor.clientName}>
              <span>
                {formatMoney(debtor.debtCents)} · {debtor.daysSinceSale} días
              </span>
            </AlertRow>
          )}
        />
      </Panel>
      <Panel title="Fichas por firmar">
        <AlertList
          items={dashboard.waiverAlerts}
          empty="Todas las fichas están al día."
          render={(alert) => (
            <AlertRow key={alert.clientId} to={`/clientes/${alert.clientId}`} name={alert.clientName}>
              <span>{alert.expiresAt ? `Vencida ${formatDate(alert.expiresAt)}` : 'Sin firmar'}</span>
            </AlertRow>
          )}
        />
      </Panel>
      <Panel title="Saldos con profesores">
        <AlertList
          items={dashboard.teacherBalances}
          empty="No hay saldos pendientes con profesores."
          render={(balance) => (
            <AlertRow key={balance.teacherId} to={`/profesores/${balance.teacherId}`} name={balance.teacherName}>
              <span className={balance.balanceCents < 0 ? 'text-danger' : ''}>{formatMoney(balance.balanceCents)}</span>
            </AlertRow>
          )}
        />
      </Panel>
    </>
  );
}
