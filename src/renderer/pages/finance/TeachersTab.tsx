import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TeacherActivity } from '../../../shared/types';
import { AXIS, BAR_GAP, ChartCard, COMPACT_TABLE, GRID, SERIES, tooltipProps } from '../../components/charts';
import { AsyncView } from '../../components/ui/States';
import { tableClass } from '../../components/ui/table';
import { call } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FinanceEmpty, FinanceSkeleton, KpiRow, KpiTile, SECTION_TITLE, useFinanceRange } from './shared';

const classesLabel = (count: number) => (count === 1 ? '1 clase' : `${count} clases`);

export function TeachersTab() {
  const range = useFinanceRange();
  const teachers = useAsync(() => call('finance:teachers', range), [range.from, range.to], { keepPreviousData: true });
  return (
    <AsyncView state={teachers} skeleton={<FinanceSkeleton />} isEmpty={(data) => data.length === 0} empty={<FinanceEmpty />}>
      {(data) => <TeachersView teachers={data} />}
    </AsyncView>
  );
}

function TeachersView({ teachers }: { teachers: TeacherActivity[] }) {
  const sum = (pick: (teacher: TeacherActivity) => number) => teachers.reduce((total, teacher) => total + pick(teacher), 0);
  const owed = sum((teacher) => Math.max(0, teacher.balanceCents));
  return (
    <div className="flex flex-col gap-6">
      <KpiRow label="Profesores en el período">
        <KpiTile label="Clases dadas" value={sum((teacher) => teacher.classes)} />
        <KpiTile label="Cobrado para profesores" value={formatMoney(sum((teacher) => teacher.earnedCents))} hint="No es ingreso del local" />
        <KpiTile label="Pagado a profesores" value={formatMoney(sum((teacher) => teacher.paidOutCents))} />
        <KpiTile label="Saldo a pagar hoy" value={formatMoney(owed)} />
      </KpiRow>

      <ChartCard title="Clases dadas" subtitle="Pases con profesor marcados en el período." table={<ClassesTable teachers={teachers} />}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={teachers} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} vertical horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...AXIS} />
            <YAxis type="category" dataKey="name" width={160} {...AXIS} />
            <Tooltip {...tooltipProps(classesLabel)} />
            <Bar dataKey="classes" name="Clases" fill={SERIES[2]} radius={[0, 4, 4, 0]} maxBarSize={28} {...BAR_GAP} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section aria-labelledby="cuentas-profesores" className="flex flex-col gap-3">
        <h2 id="cuentas-profesores" className={SECTION_TITLE}>
          Cuentas de cada profesor
        </h2>
        <table className={`${tableClass} ${COMPACT_TABLE}`}>
          <caption className="sr-only">Clases, cobros y pagos de cada profesor</caption>
          <thead>
            <tr>
              <th scope="col">Profesor</th>
              <th scope="col">Clases</th>
              <th scope="col">Alumnos</th>
              <th scope="col">Cobrado para el profesor</th>
              <th scope="col">Pagado en el período</th>
              <th scope="col">Saldo hoy</th>
              <th scope="col">Clases por dar</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher.teacherId} className={teacher.active ? '' : 'text-ink-soft'}>
                <td className="font-semibold">
                  <Link to={`/profesores/${teacher.teacherId}`} className="underline decoration-ochre underline-offset-4 hover:text-accent-ink">
                    {teacher.name}
                  </Link>
                  {!teacher.active && <span className="font-normal"> (inactivo)</span>}
                </td>
                <td className="tabular-nums">{teacher.classes}</td>
                <td className="tabular-nums">{teacher.students}</td>
                <td className="tabular-nums">{formatMoney(teacher.earnedCents)}</td>
                <td className="tabular-nums">{formatMoney(teacher.paidOutCents)}</td>
                <td className={`tabular-nums ${teacher.balanceCents < 0 ? 'text-danger' : ''}`}>{formatMoney(teacher.balanceCents)}</td>
                <td className="tabular-nums">{teacher.pendingClasses}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-ink-soft">
          Lo cobrado para el profesor sale del monto para el profesor de cada plan: es del profesor, no es ingreso del local. El saldo es lo que
          el local le debe hoy. Las clases por dar son los pases con profesor vendidos que todavía no se usaron.
        </p>
      </section>
    </div>
  );
}

function ClassesTable({ teachers }: { teachers: TeacherActivity[] }) {
  return (
    <table className={`${tableClass} ${COMPACT_TABLE}`}>
      <caption className="sr-only">Clases dadas por profesor</caption>
      <thead>
        <tr>
          <th scope="col">Profesor</th>
          <th scope="col">Clases</th>
        </tr>
      </thead>
      <tbody>
        {teachers.map((teacher) => (
          <tr key={teacher.teacherId}>
            <td className="font-semibold">{teacher.name}</td>
            <td className="tabular-nums">{teacher.classes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
