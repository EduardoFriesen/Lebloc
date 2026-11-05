import { type ReactNode, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Badge, Card, CardGrid, PassBadge, Stat, StatRow } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { PageBar, usePage } from '../components/ui/Pager';
import { ClearFilter, SUMMARY_LIST, SUMMARY_TOP, SummaryTable, SummaryValue, WITH_SUMMARY } from '../components/ui/SummaryTable';
import { AsyncView, EmptyState } from '../components/ui/States';
import type { ClientListInput } from '../../shared/schemas';
import type { ClientSummary } from '../../shared/types';
import { call } from '../lib/api';
import { sum } from '../lib/arrays';
import { ageLabel, debtLabel, formatMoney, fullName, waiverLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { NewClientDialog } from './ClientForm';

// Every filter is picked from the summary beside the list (`?vista=`); the Pases and Finanzas summaries link to some.
const FILTERS: Record<string, { label: string; filter: Partial<ClientListInput>; empty: { title: string; text: string } }> = {
  pases: { label: 'Con pases', filter: { onlyWithPasses: true }, empty: { title: 'Nadie tiene pases', text: 'Ningún cliente tiene pases disponibles.' } },
  sinpases: { label: 'Sin pases', filter: { onlyWithoutPasses: true }, empty: { title: 'Todos tienen pases', text: 'Ningún cliente activo se quedó sin pases.' } },
  deuda: { label: 'Deudores', filter: { onlyDebtors: true }, empty: { title: 'Nadie debe nada', text: 'Todas las ventas están saldadas.' } },
  fichas: { label: 'Sin ficha', filter: { onlyPendingWaiver: true }, empty: { title: 'Fichas al día', text: 'Todos entregaron la ficha.' } },
  menores: { label: 'Menores', filter: { onlyMinors: true }, empty: { title: 'No hay menores', text: 'Ningún cliente activo es menor de 18 años.' } },
  nuevos: { label: 'Nuevos del mes', filter: { onlyNewThisMonth: true }, empty: { title: 'Nadie nuevo este mes', text: 'Ningún cliente se inscribió este mes.' } },
  archivados: { label: 'Archivados', filter: { onlyArchived: true }, empty: { title: 'No hay archivados', text: 'Ningún cliente está archivado.' } },
};

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // In the URL so "Volver" from a client keeps the filter, and the Pases summary can link to it.
  const [params, setParams] = useSearchParams();
  const key = params.get('vista');
  const active = key !== null && Object.hasOwn(FILTERS, key) ? FILTERS[key] : undefined;
  const clients = useAsync(
    () => call('clients:list', { search, includeArchived: false, ...active?.filter }),
    [search, active],
    { keepPreviousData: true },
  );
  const stats = useAsync(() => call('clients:stats', {}), []);
  const onlyDebtors = active?.filter.onlyDebtors === true;
  const empty = search
    ? { title: 'Sin resultados', text: 'Probá con otro nombre o apellido.' }
    : (active?.empty ?? { title: 'Todavía no hay clientes', text: 'Cargá el primero con “Nuevo cliente”.' });

  /** A summary row shows only its clients, dropping the search; "Activos" shows them all. */
  function select(next: string | null) {
    setSearch('');
    setParams(next === null ? {} : { vista: next }, { replace: true });
  }

  const row = (label: string, value: ReactNode, filter: string) => ({ label, value, onSelect: () => select(filter), selected: key === filter });

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader title="Clientes" actions={<Button onClick={() => setCreating(true)}>Nuevo cliente</Button>} />
        <NewClientDialog open={creating} onClose={() => setCreating(false)} />
        <div className="mb-6 w-full max-w-md">
          <TextField label="Buscar" type="search" placeholder="Nombre, apellido o DNI" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {active && <ClearFilter label={active.label} onClear={() => select(null)} />}
      </div>
      <div className={SUMMARY_LIST}>
        <AsyncView
          state={clients}
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState title={empty.title}>
              <p className="text-sm">{empty.text}</p>
            </EmptyState>
          }
        >
          {(data) => (
            <>
              {onlyDebtors && (
                <p className="mb-4 font-display text-2xl font-semibold">
                  Total adeudado <span className="text-accent-ink">{formatMoney(sum(data.map((client) => client.debtCents)))}</span>
                  <span className="font-sans text-base font-normal text-ink-soft">
                    {' '}
                    · {data.length} {data.length === 1 ? 'cliente' : 'clientes'}
                  </span>
                </p>
              )}
              {/* Keyed by the filters so a new filter starts on the first page. */}
              <ClientCards key={`${search}|${key ?? ''}`} clients={data} />
            </>
          )}
        </AsyncView>
      </div>
      <SummaryTable
        state={stats}
        rows={(data) => [
          { label: 'Activos', value: <SummaryValue count={data.active} />, onSelect: () => select(null) },
          row('Con pases', <SummaryValue count={data.withPasses} />, 'pases'),
          row('Sin pases', <SummaryValue count={data.withoutPasses} />, 'sinpases'),
          row('Deudores', <SummaryValue count={data.debtorCount} amount={data.debtorCount > 0 ? formatMoney(data.debtTotalCents) : undefined} />, 'deuda'),
          row('Sin ficha', <SummaryValue count={data.pendingWaivers} />, 'fichas'),
          row('Menores', <SummaryValue count={data.minors} />, 'menores'),
          row('Nuevos del mes', <SummaryValue count={data.newThisMonth} />, 'nuevos'),
          row('Archivados', <SummaryValue count={data.archived} />, 'archivados'),
        ]}
      />
    </section>
  );
}

const CLIENTS_PAGE_SIZE = 24;

/** A page of client cards with the ‹ 1 / 9 › bar under them; changing page brings the first card back into view. */
function ClientCards({ clients }: { clients: ClientSummary[] }) {
  const top = useRef<HTMLDivElement>(null);
  const { visible, page, pages, setPage } = usePage(clients, CLIENTS_PAGE_SIZE);

  function goTo(next: number) {
    setPage(next);
    top.current?.scrollIntoView({ block: 'start' });
  }

  return (
    <div ref={top} className="flex flex-col gap-4">
      <CardGrid label="Clientes">
        {visible.map((client) => (
          <Card
            key={client.id}
            to={`/clientes/${client.id}`}
            title={fullName(client)}
            subtitle={ageLabel(client.birthDate)}
            muted={client.archivedAt !== null}
            tone={client.passStatus}
            badges={
              (client.passStatus !== 'ok' || client.debtCents > 0 || client.waiver.state !== 'valid' || client.archivedAt) && (
                <>
                  {client.archivedAt && <Badge>Archivado</Badge>}
                  {!client.archivedAt && <PassBadge status={client.passStatus} expiresAt={client.expiresAt} />}
                  {client.debtCents > 0 && <Badge tone="debt">{debtLabel(client)}</Badge>}
                  {client.waiver.state !== 'valid' && <Badge tone="warning">{waiverLabel(client.waiver)}</Badge>}
                </>
              )
            }
          >
            <StatRow>
              <Stat label="Pases libres">{client.remainingFree}</Stat>
              <Stat label="Con profesor">{client.remainingTeacher}</Stat>
            </StatRow>
          </Card>
        ))}
      </CardGrid>
      <PageBar label="Clientes" page={page} pages={pages} onChange={goTo} />
    </div>
  );
}
