import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ButtonLink } from '../components/ui/Button';
import { Badge, Card, CardGrid, Stat } from '../components/ui/Card';
import { CheckboxField, TextField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { sum } from '../lib/arrays';
import { ageLabel, debtLabel, formatMoney, fullName, waiverLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  // In the URL so "Volver" from a client keeps the filter, and the counter's "Ver todos" can link to it.
  const [params, setParams] = useSearchParams();
  const onlyDebtors = params.get('deuda') === '1';
  const clients = useAsync(
    () => call('clients:list', { search, includeArchived, onlyDebtors }),
    [search, includeArchived, onlyDebtors],
    { keepPreviousData: true },
  );
  const empty = search
    ? { title: 'Sin resultados', text: 'Probá con otro nombre o apellido.' }
    : onlyDebtors
      ? { title: 'Nadie debe nada', text: 'Todas las ventas están saldadas.' }
      : { title: 'Todavía no hay clientes', text: 'Cargá el primero con “Nuevo cliente”.' };

  return (
    <section className="p-8">
      <PageHeader title="Clientes" actions={<ButtonLink to="/clientes/nuevo">Nuevo cliente</ButtonLink>} />
      <div className="mb-6 flex flex-wrap items-end gap-6">
        <div className="w-full max-w-md">
          <TextField label="Buscar" type="search" placeholder="Nombre o apellido" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <CheckboxField label="Incluir archivados" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
        <CheckboxField
          label="Solo con deuda"
          checked={onlyDebtors}
          onChange={(event) => setParams(event.target.checked ? { deuda: '1' } : {}, { replace: true })}
        />
      </div>
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
            <CardGrid label="Clientes">
              {data.map((client) => (
                <Card
                  key={client.id}
                  to={`/clientes/${client.id}`}
                  title={fullName(client)}
                  subtitle={ageLabel(client.birthDate)}
                  muted={client.archivedAt !== null}
                  badges={
                    (client.debtCents > 0 || client.waiver.state !== 'valid' || client.archivedAt) && (
                      <>
                        {client.archivedAt && <Badge>Archivado</Badge>}
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
          </>
        )}
      </AsyncView>
    </section>
  );
}
