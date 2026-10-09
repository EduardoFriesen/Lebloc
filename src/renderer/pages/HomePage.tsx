import { type ReactNode, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { ClientSummary, Dashboard } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { formatDate, formatMoney, fullName, PASS_KIND_LABELS, waiverLabel } from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

const WAIVER_ALERTS_SHOWN = 10;

export function HomePage() {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const query = search.trim();
  const dashboard = useAsync(() => call('dashboard:get', {}), []);
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
      results.reload();
      dashboard.reload();
    } catch (caught) {
      setNotice({ tone: 'error', text: `${fullName(client)}: ${errorMessage(caught)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-8 p-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
        {query === '' ? (
          <p className="text-sm text-granite-soft">Escribí un nombre para empezar.</p>
        ) : (
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
            {(clients) => (
              <ul className="flex flex-col gap-2">
                {clients.map((client) => (
                  <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper p-4 shadow-warm">
                    <div>
                      <Link className="font-display text-xl font-semibold hover:underline" to={`/clientes/${client.id}`}>
                        {fullName(client)}
                      </Link>
                      <p className="text-sm text-granite-soft">
                        Libres: {client.remainingFree} · Con profesor: {client.remainingTeacher}
                        {client.debtCents > 0 && <span className="font-semibold text-volt-ink"> · Debe {formatMoney(client.debtCents)}</span>}
                        {client.waiver.state !== 'valid' && <span className="font-semibold text-danger"> · {waiverLabel(client.waiver)}</span>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        disabled={busy || client.remainingFree <= 0}
                        aria-label={`Pase libre para ${fullName(client)}`}
                        onClick={() => void consume(client, 'free')}
                      >
                        Libre
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy || client.remainingTeacher <= 0}
                        aria-label={`Pase con profesor para ${fullName(client)}`}
                        onClick={() => void consume(client, 'teacher')}
                      >
                        Con profesor
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AsyncView>
        )}
      </div>
      <aside aria-label="Alertas" className="flex flex-col gap-6">
        <AsyncView state={dashboard} skeleton={<SkeletonRows rows={6} />}>
          {(data) => <DashboardPanels dashboard={data} />}
        </AsyncView>
      </aside>
    </section>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-paper p-5 shadow-warm">
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

function DashboardPanels({ dashboard }: { dashboard: Dashboard }) {
  return (
    <>
      <Panel title="Pocos pases">
        {dashboard.lowPasses.length === 0 ? (
          <p className="text-sm text-granite-soft">Nadie está por quedarse sin pases.</p>
        ) : (
          <ul className="divide-y divide-granite/10 text-sm">
            {dashboard.lowPasses.map((alert) => (
              <li key={alert.clientId} className="flex justify-between py-2">
                <Link className="font-semibold hover:underline" to={`/clientes/${alert.clientId}`}>
                  {alert.clientName}
                </Link>
                <span>{alert.remainingFree + alert.remainingTeacher} restantes</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="Deudores"
        action={
          <Link className="text-sm underline" to="/deudores">
            Ver todos
          </Link>
        }
      >
        {dashboard.debtors.length === 0 ? (
          <p className="text-sm text-granite-soft">No hay deudas pendientes.</p>
        ) : (
          <ul className="divide-y divide-granite/10 text-sm">
            {dashboard.debtors.map((debtor) => (
              <li key={debtor.saleId} className="flex justify-between gap-2 py-2">
                <Link className="font-semibold hover:underline" to={`/clientes/${debtor.clientId}`}>
                  {debtor.clientName}
                </Link>
                <span>
                  {formatMoney(debtor.debtCents)} · {debtor.daysSinceSale} días
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Fichas por firmar">
        {dashboard.waiverAlerts.length === 0 ? (
          <p className="text-sm text-granite-soft">Todas las fichas están al día.</p>
        ) : (
          <ul className="divide-y divide-granite/10 text-sm">
            {dashboard.waiverAlerts.slice(0, WAIVER_ALERTS_SHOWN).map((alert) => (
              <li key={alert.clientId} className="flex justify-between gap-2 py-2">
                <Link className="font-semibold hover:underline" to={`/clientes/${alert.clientId}`}>
                  {alert.clientName}
                </Link>
                <span>{alert.expiresAt ? `Vencida ${formatDate(alert.expiresAt)}` : 'Sin firmar'}</span>
              </li>
            ))}
            {dashboard.waiverAlerts.length > WAIVER_ALERTS_SHOWN && (
              <li className="py-2 text-granite-soft">y {dashboard.waiverAlerts.length - WAIVER_ALERTS_SHOWN} más</li>
            )}
          </ul>
        )}
      </Panel>
      <Panel title="Saldos con profesores">
        {dashboard.teacherBalances.length === 0 ? (
          <p className="text-sm text-granite-soft">No hay saldos pendientes con profesores.</p>
        ) : (
          <ul className="divide-y divide-granite/10 text-sm">
            {dashboard.teacherBalances.map((balance) => (
              <li key={balance.teacherId} className="flex justify-between py-2">
                <Link className="font-semibold hover:underline" to={`/profesores/${balance.teacherId}`}>
                  {balance.teacherName}
                </Link>
                <span className={balance.balanceCents < 0 ? 'text-danger' : ''}>{formatMoney(balance.balanceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
