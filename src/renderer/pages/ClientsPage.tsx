import { useState } from 'react';
import { ButtonLink } from '../components/ui/Button';
import { Badge, Card, CardGrid, Stat } from '../components/ui/Card';
import { CheckboxField, TextField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { ageLabel, formatMoney, fullName, waiverLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const clients = useAsync(() => call('clients:list', { search, includeArchived }), [search, includeArchived], {
    keepPreviousData: true,
  });

  return (
    <section className="p-8">
      <PageHeader title="Clientes" actions={<ButtonLink to="/clientes/nuevo">Nuevo cliente</ButtonLink>} />
      <div className="mb-6 flex flex-wrap items-end gap-6">
        <div className="w-full max-w-md">
          <TextField label="Buscar" type="search" placeholder="Nombre o apellido" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <CheckboxField label="Incluir archivados" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
      </div>
      <AsyncView
        state={clients}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title={search ? 'Sin resultados' : 'Todavía no hay clientes'}>
            <p className="text-sm">{search ? 'Probá con otro nombre o apellido.' : 'Cargá el primero con “Nuevo cliente”.'}</p>
          </EmptyState>
        }
      >
        {(data) => (
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
                      {client.debtCents > 0 && <Badge tone="debt">Debe {formatMoney(client.debtCents)}</Badge>}
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
        )}
      </AsyncView>
    </section>
  );
}
