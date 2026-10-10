import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Teacher } from '../../shared/types';
import { ButtonLink } from '../components/ui/Button';
import { CheckboxField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { formatMoney, fullName, WEEKDAY_LABELS } from '../lib/format';
import { useAsync } from '../lib/useAsync';

function scheduleSummary(teacher: Teacher): string {
  if (teacher.schedules.length === 0) return 'Sin horarios';
  return teacher.schedules
    .map((schedule) => `${WEEKDAY_LABELS[schedule.weekday] ?? '?'} ${schedule.startTime}–${schedule.endTime}`)
    .join(' · ');
}

export function TeachersPage() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const teachers = useAsync(() => call('teachers:list', { includeInactive }), [includeInactive], { keepPreviousData: true });

  return (
    <section className="p-8">
      <PageHeader
        title="Profesores"
        subtitle="Las clases con profesor están tercerizadas: el recargo le corresponde al profesor, no al local."
        actions={<ButtonLink to="/profesores/nuevo">Nuevo profesor</ButtonLink>}
      />
      <div className="mb-4">
        <CheckboxField label="Mostrar inactivos" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
      </div>
      <AsyncView
        state={teachers}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Todavía no hay profesores">
            <p className="text-sm">Cargá uno con “Nuevo profesor”.</p>
          </EmptyState>
        }
      >
        {(data) => (
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col">Profesor</th>
                <th scope="col">Importe por clase</th>
                <th scope="col">Horarios</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((teacher) => (
                <tr key={teacher.id}>
                  <td>
                    <Link className="font-semibold underline-offset-4 hover:underline" to={`/profesores/${teacher.id}`}>
                      {fullName(teacher)}
                    </Link>
                  </td>
                  <td>{formatMoney(teacher.classRateCents)}</td>
                  <td className="text-ink-soft">{scheduleSummary(teacher)}</td>
                  <td>{teacher.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="text-right">
                    <ButtonLink variant="ghost" to={`/profesores/${teacher.id}/editar`} aria-label={`Editar ${fullName(teacher)}`}>
                      Editar
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
    </section>
  );
}
