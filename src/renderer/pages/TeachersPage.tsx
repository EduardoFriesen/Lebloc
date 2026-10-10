import { useState } from 'react';
import type { Teacher } from '../../shared/types';
import { ButtonLink } from '../components/ui/Button';
import { Badge, Card, CardGrid } from '../components/ui/Card';
import { CheckboxField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { formatMoney, fullName, WEEKDAY_LABELS } from '../lib/format';
import { useAsync } from '../lib/useAsync';

function scheduleLines(teacher: Teacher): string[] {
  return teacher.schedules.map((schedule) => `${WEEKDAY_LABELS[schedule.weekday] ?? '?'} ${schedule.startTime}–${schedule.endTime}`);
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
          <CardGrid label="Profesores">
            {data.map((teacher) => (
              <Card
                key={teacher.id}
                to={`/profesores/${teacher.id}`}
                title={fullName(teacher)}
                subtitle={`${formatMoney(teacher.classRateCents)} por clase`}
                muted={!teacher.active}
                badges={!teacher.active && <Badge>Inactivo</Badge>}
                actions={
                  <ButtonLink variant="ghost" to={`/profesores/${teacher.id}/editar`} aria-label={`Editar ${fullName(teacher)}`}>
                    Editar
                  </ButtonLink>
                }
              >
                {teacher.schedules.length === 0 ? (
                  <p className="text-sm text-ink-soft">Sin horarios</p>
                ) : (
                  <ul aria-label="Horarios" className="flex flex-col text-sm">
                    {scheduleLines(teacher).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </CardGrid>
        )}
      </AsyncView>
    </section>
  );
}
