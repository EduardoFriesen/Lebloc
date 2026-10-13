import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Badge, Card, CardGrid, PassBadge, Stat } from '../components/ui/Card';
import { CheckboxField, TextField } from '../components/ui/Field';
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

// Filters picked only from the summary (`?vista=`); the rest have their own checkbox.
const VIEWS: Record<string, { label: string; filter: Partial<ClientListInput>; empty: { title: string; text: string } }> = {
  sinpases: { label: 'Sin pases', filter: { onlyWithoutPasses: true }, empty: { title: 'Todos tienen pases', text: 'Ningún cliente activo se quedó sin pases.' } },
  menores: { label: 'Menores', filter: { onlyMinors: true }, empty: { title: 'No hay menores', text: 'Ningún cliente activo es menor de 18 años.' } },
  nuevos: { label: 'Nuevos del mes', filter: { onlyNewThisMonth: true }, empty: { title: 'Nadie nuevo este mes', text: 'Ningún cliente se inscribió este mes.' } },
  archivados: { label: 'Archivados', filter: { onlyArchived: true }, empty: { title: 'No hay archivados', text: 'Ningún cliente está archivado.' } },
};

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  // In the URL so "Volver" from a client keeps the filter, and the counter's "Ver todos" can link to it.
  const [params, setParams] = useSearchParams();
  const onlyDebtors = params.get('deuda') === '1';
  const onlyWithPasses = params.get('pases') === '1';
  const onlyPendingWaiver = params.get('fichas') === '1';
  const viewKey = params.get('vista') ?? '';
  const view = VIEWS[viewKey];
  const clients = useAsync(
    () => call('clients:list', { search, includeArchived, onlyDebtors, onlyWithPasses, onlyPendingWaiver, ...view?.filter }),
    [search, includeArchived, onlyDebtors, onlyWithPasses, onlyPendingWaiver, view],
    { keepPreviousData: true },
  );
  const stats = useAsync(() => call('clients:stats', {}), []);
  const empty = search
    ? { title: 'Sin resultados', text: 'Probá con otro nombre o apellido.' }
    : view
      ? view.empty
      : onlyDebtors
      ? { title: 'Nadie debe nada', text: 'Todas las ventas están saldadas.' }
      : onlyWithPasses
        ? { title: 'Nadie tiene pases', text: 'Ningún cliente tiene pases disponibles.' }
        : onlyPendingWaiver
          ? { title: 'Fichas al día', text: 'Nadie tiene la ficha vencida ni sin firmar.' }
          : { title: 'Todavía no hay clientes', text: 'Cargá el primero con “Nuevo cliente”.' };

  function setFilter(key: 'deuda' | 'pases' | 'fichas', on: boolean) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (on) next.set(key, '1');
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  /** A summary row shows only its items: it drops every other filter and the search. */
  function selectOnly(next: Record<string, string>) {
    setSearch('');
    setIncludeArchived(false);
    setParams(next, { replace: true });
  }

  function clearView() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('vista');
        return next;
      },
      { replace: true },
    );
  }

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader title="Clientes" actions={<Button onClick={() => setCreating(true)}>Nuevo cliente</Button>} />
        <NewClientDialog open={creating} onClose={() => setCreating(false)} />
        <div className="mb-6 flex flex-wrap items-end gap-6">
          <div className="w-full max-w-md">
            <TextField label="Buscar" type="search" placeholder="Nombre o apellido" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <CheckboxField label="Incluir archivados" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
          <CheckboxField label="Solo con pases" checked={onlyWithPasses} onChange={(event) => setFilter('pases', event.target.checked)} />
          <CheckboxField label="Solo con deuda" checked={onlyDebtors} onChange={(event) => setFilter('deuda', event.target.checked)} />
          <CheckboxField label="Ficha por actualizar" checked={onlyPendingWaiver} onChange={(event) => setFilter('fichas', event.target.checked)} />
        </div>
        {view && <ClearFilter label={view.label} onClear={clearView} />}
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
              <ClientCards key={`${search}|${includeArchived}|${params.toString()}`} clients={data} />
            </>
          )}
        </AsyncView>
      </div>
      <SummaryTable
        state={stats}
        rows={(data) => [
          { label: 'Activos', value: <SummaryValue count={data.active} />, onSelect: () => selectOnly({}) },
          { label: 'Con pases', value: <SummaryValue count={data.withPasses} />, onSelect: () => selectOnly({ pases: '1' }), selected: onlyWithPasses },
          { label: 'Sin pases', value: <SummaryValue count={data.withoutPasses} />, onSelect: () => selectOnly({ vista: 'sinpases' }), selected: viewKey === 'sinpases' },
          {
            label: 'Deudores',
            value: <SummaryValue count={data.debtorCount} amount={data.debtorCount > 0 ? formatMoney(data.debtTotalCents) : undefined} />,
            onSelect: () => selectOnly({ deuda: '1' }),
            selected: onlyDebtors,
          },
          {
            label: 'Fichas por actualizar',
            value: <SummaryValue count={data.pendingWaivers} />,
            onSelect: () => selectOnly({ fichas: '1' }),
            selected: onlyPendingWaiver,
          },
          { label: 'Menores', value: <SummaryValue count={data.minors} />, onSelect: () => selectOnly({ vista: 'menores' }), selected: viewKey === 'menores' },
          { label: 'Nuevos del mes', value: <SummaryValue count={data.newThisMonth} />, onSelect: () => selectOnly({ vista: 'nuevos' }), selected: viewKey === 'nuevos' },
          { label: 'Archivados', value: <SummaryValue count={data.archived} />, onSelect: () => selectOnly({ vista: 'archivados' }), selected: viewKey === 'archivados' },
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
                  {!client.archivedAt && <PassBadge status={client.passStatus} />}
                  {client.debtCents > 0 && <Badge tone="debt">{debtLabel(client)}</Badge>}
                  {client.waiver.state !== 'valid' && <Badge tone="warning">{waiverLabel(client.waiver)}</Badge>}
                </>
              )
            }
          >
            <dl className="flex gap-6">
              <Stat label="Pases libres">{client.remainingFree}</Stat>
              <Stat label="Con profesor">{client.remainingTeacher}</Stat>
            </dl>
          </Card>
        ))}
      </CardGrid>
      <PageBar label="Clientes" page={page} pages={pages} onChange={goTo} />
    </div>
  );
}
