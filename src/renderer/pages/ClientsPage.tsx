import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/ui/Button';
import { CheckboxField, TextField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { ageLabel, formatMoney, fullName } from '../lib/format';
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
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Edad</th>
                <th scope="col">Pases libres</th>
                <th scope="col">Pases con profesor</th>
                <th scope="col">Deuda</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((client) => (
                <tr key={client.id} className={client.archivedAt ? 'text-ink-soft' : ''}>
                  <td>
                    <Link className="font-semibold underline-offset-4 hover:underline" to={`/clientes/${client.id}`}>
                      {fullName(client)}
                    </Link>
                  </td>
                  <td>{ageLabel(client.birthDate)}</td>
                  <td>{client.remainingFree}</td>
                  <td>{client.remainingTeacher}</td>
                  <td className={client.debtCents > 0 ? 'font-semibold text-accent-ink' : ''}>
                    {client.debtCents > 0 ? formatMoney(client.debtCents) : '—'}
                  </td>
                  <td>{client.archivedAt ? 'Archivado' : 'Activo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
    </section>
  );
}
