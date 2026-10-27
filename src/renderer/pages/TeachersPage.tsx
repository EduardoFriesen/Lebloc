import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Teacher } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Badge, Card, CardGrid, Stat, StatRow } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { CheckboxField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { ClearFilter, SUMMARY_LIST, SUMMARY_TOP, SummaryTable, SummaryValue, WITH_SUMMARY } from '../components/ui/SummaryTable';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { formatMoney, fullName, WEEKDAY_LABELS } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { TeacherForm } from './TeacherForm';

function scheduleLines(teacher: Teacher): string[] {
  return teacher.schedules.map((schedule) => `${WEEKDAY_LABELS[schedule.weekday] ?? '?'} ${schedule.startTime}–${schedule.endTime}`);
}

export function TeachersPage() {
  const navigate = useNavigate();
  const [includeInactive, setIncludeInactive] = useState(false);
  // Picked from the summary; there are few teachers and no LIMIT, so the list is filtered here.
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null);
  const teachers = useAsync(
    async () => {
      const [list, balances] = await Promise.all([
        call('teachers:list', { includeInactive: includeInactive || onlyInactive }),
        call('teachers:balances', {}),
      ]);
      const balanceById = new Map(balances.map((balance) => [balance.teacherId, balance]));
      return list
        .filter((teacher) => !onlyInactive || !teacher.active)
        .map((teacher) => {
          const balance = balanceById.get(teacher.id);
          return {
            ...teacher,
            balanceCents: balance?.balanceCents ?? 0,
            pendingClasses: balance?.pendingClasses ?? 0,
          };
        });
    },
    [includeInactive, onlyInactive],
    { keepPreviousData: true },
  );
  const stats = useAsync(() => call('teachers:stats', {}), []);

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader
          title="Profesores"
          subtitle="Las clases con profesor están tercerizadas: el recargo le corresponde al profesor, no al local."
          actions={<Button onClick={() => setEditing('new')}>Nuevo profesor</Button>}
        />
        <div className="mb-4">
          <CheckboxField label="Mostrar inactivos" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
        </div>
        {onlyInactive && <ClearFilter label="Inactivos" onClear={() => setOnlyInactive(false)} />}
      </div>
      <div className={SUMMARY_LIST}>
        <AsyncView
          state={teachers}
          isEmpty={(data) => data.length === 0}
          empty={
            onlyInactive ? (
              <EmptyState title="No hay profesores inactivos" />
            ) : (
              <EmptyState title="Todavía no hay profesores">
                <p className="text-sm">Cargá uno con “Nuevo profesor”.</p>
              </EmptyState>
            )
          }
        >
          {(data) => (
            <CardGrid label="Profesores">
              {data.map((teacher) => (
                <Card
                  key={teacher.id}
                  to={`/profesores/${teacher.id}`}
                  title={fullName(teacher)}
                  muted={!teacher.active}
                  badges={!teacher.active && <Badge>Inactivo</Badge>}
                  actions={
                    <Button variant="edit" aria-label={`Editar ${fullName(teacher)}`} onClick={() => setEditing(teacher)}>
                      Editar
                    </Button>
                  }
                >
                  <StatRow>
                    <Stat label="Se le debe">
                      <span className={teacher.balanceCents < 0 ? 'text-danger' : ''}>{formatMoney(teacher.balanceCents)}</span>
                    </Stat>
                    <Stat label="Clases por dar">{teacher.pendingClasses}</Stat>
                  </StatRow>
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
      </div>
      <SummaryTable
        state={stats}
        rows={(data) => [
          {
            label: 'Activos',
            value: <SummaryValue count={data.active} />,
            onSelect: () => {
              setOnlyInactive(false);
              setIncludeInactive(false);
            },
          },
          {
            label: 'Inactivos',
            value: <SummaryValue count={data.inactive} />,
            onSelect: () => {
              setOnlyInactive(true);
              setIncludeInactive(false);
            },
            selected: onlyInactive,
          },
          {
            label: 'Saldo a pagar',
            value: <SummaryValue count={data.owedTeachers} amount={data.owedTeachers > 0 ? formatMoney(data.owedCents) : undefined} />,
          },
          {
            label: 'Clases pendientes',
            value: <SummaryValue count={data.pendingClasses} />,
          },
        ]}
      />
      <Dialog wide open={editing !== null} title={editing === 'new' ? 'Nuevo profesor' : 'Editar profesor'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <TeacherForm
            teacher={editing === 'new' ? null : editing}
            onSaved={(saved) => {
              if (editing === 'new') {
                navigate(`/profesores/${saved.id}`);
                return;
              }
              setEditing(null);
              teachers.reload();
              stats.reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
