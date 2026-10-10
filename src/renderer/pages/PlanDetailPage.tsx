import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { EnrollmentsSection } from '../components/ui/Enrollments';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { currentMonthLabel, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { passesSummary, PlanForm } from './PlansPage';

export function PlanDetailPage() {
  const planId = Number(useParams().id);
  const plan = useAsync(() => call('plans:get', { id: planId }), [planId]);
  const enrollments = useAsync(() => call('plans:enrollments', { id: planId }), [planId]);
  const [editing, setEditing] = useState(false);

  return (
    <section className="flex flex-col gap-6 p-8">
      <AsyncView state={plan} skeleton={<SkeletonRows rows={2} />}>
        {(data) => (
          <>
            <PageHeader
              title={data.name}
              subtitle={`${passesSummary(data)} · ${formatMoney(data.priceCents)} precio del local${data.active ? '' : ' · Inactivo'}`}
              actions={
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Editar
                </Button>
              }
            />
            <Dialog open={editing} title="Editar plan" onClose={() => setEditing(false)}>
              {editing && (
                <PlanForm
                  plan={data}
                  onSaved={() => {
                    setEditing(false);
                    plan.reload();
                  }}
                  onCancel={() => setEditing(false)}
                />
              )}
            </Dialog>
          </>
        )}
      </AsyncView>
      <AsyncView state={enrollments} skeleton={<SkeletonRows rows={4} />}>
        {(data) => <EnrollmentsSection enrollments={data} context="teacher" empty={`Nadie se anotó en este plan en ${currentMonthLabel()}.`} />}
      </AsyncView>
    </section>
  );
}
