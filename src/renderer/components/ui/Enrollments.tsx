import { useId } from 'react';
import type { Enrollment } from '../../../shared/types';
import { currentMonthLabel, formatDate, formatMoney } from '../../lib/format';
import { Badge, Card, PassBadge } from './Card';
import { PagedList } from './Pager';

interface EnrollmentsSectionProps {
  enrollments: readonly Enrollment[];
  /** What each card mentions besides the client: the teacher (on a plan) or the plan (on a teacher). */
  context: 'teacher' | 'plan';
  empty: string;
}

/** "Inscriptos en {mes}": this month's sales as thin cards, 4 per page, each opening the client. */
export function EnrollmentsSection({ enrollments, context, empty }: EnrollmentsSectionProps) {
  const id = useId();
  const title = `Inscriptos en ${currentMonthLabel()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-2xl font-semibold">
        {title}
      </h2>
      {enrollments.length === 0 ? (
        <p className="text-sm text-ink-soft">{empty}</p>
      ) : (
        <PagedList items={enrollments} label={title} render={(enrollment) => <EnrollmentStrip key={enrollment.saleId} enrollment={enrollment} context={context} />} />
      )}
    </section>
  );
}

function EnrollmentStrip({ enrollment, context }: { enrollment: Enrollment; context: 'teacher' | 'plan' }) {
  const detail = context === 'plan' ? enrollment.planName : enrollment.teacherName ? `Con ${enrollment.teacherName}` : 'Sin profesor';
  return (
    <Card
      strip
      tone={enrollment.passStatus}
      to={`/clientes/${enrollment.clientId}`}
      title={enrollment.clientName}
      subtitle={
        <>
          {detail} · vendido el {formatDate(enrollment.soldAt)}
          <br />
          Libres: {enrollment.remainingFree} · Con profesor: {enrollment.remainingTeacher}
        </>
      }
      badges={
        <>
          <PassBadge status={enrollment.passStatus} />
          {enrollment.debtCents > 0 && <Badge tone="debt">Debe {formatMoney(enrollment.debtCents)}</Badge>}
        </>
      }
    />
  );
}
