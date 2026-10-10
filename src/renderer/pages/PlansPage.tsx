import { type FormEvent, useState } from 'react';
import { parseMoneyInput } from '../../shared/money';
import { planInput } from '../../shared/schemas';
import type { Plan } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { CheckboxField, MoneyField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { formatMoney, formatMoneyInput } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function PlansPage() {
  const plans = useAsync(() => call('plans:list', { includeInactive: true }), []);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  function saved() {
    setEditing(null);
    plans.reload();
  }

  return (
    <section className="p-8">
      <PageHeader
        title="Planes"
        subtitle="Packs de pases sin vencimiento. El recargo del profesor se suma al vender, según el profesor elegido."
        actions={<Button onClick={() => setEditing('new')}>Nuevo plan</Button>}
      />
      <AsyncView
        state={plans}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Todavía no hay planes">
            <p className="text-sm">Creá el primero con “Nuevo plan”.</p>
          </EmptyState>
        }
      >
        {(data) => (
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Libres</th>
                <th scope="col">Con profesor</th>
                <th scope="col">Precio del local</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((plan) => (
                <tr key={plan.id} className={plan.active ? '' : 'text-ink-soft'}>
                  <td className="font-semibold">{plan.name}</td>
                  <td>{plan.freePasses}</td>
                  <td>{plan.teacherPasses}</td>
                  <td>{formatMoney(plan.priceCents)}</td>
                  <td>{plan.active ? 'Activo' : 'Inactivo'}</td>
                  <td className="text-right">
                    <Button variant="ghost" aria-label={`Editar ${plan.name}`} onClick={() => setEditing(plan)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
      <Dialog open={editing !== null} title={editing === 'new' ? 'Nuevo plan' : 'Editar plan'} onClose={() => setEditing(null)}>
        {editing !== null && <PlanForm plan={editing === 'new' ? null : editing} onSaved={saved} onCancel={() => setEditing(null)} />}
      </Dialog>
    </section>
  );
}

function PlanForm({ plan, onSaved, onCancel }: { plan: Plan | null; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [freePasses, setFreePasses] = useState(String(plan?.freePasses ?? 0));
  const [teacherPasses, setTeacherPasses] = useState(String(plan?.teacherPasses ?? 0));
  const [price, setPrice] = useState(plan ? formatMoneyInput(plan.priceCents) : '');
  const [active, setActive] = useState(plan?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const priceCents = parseMoneyInput(price);
    const parsed = planInput.safeParse({
      name,
      freePasses: Number(freePasses),
      teacherPasses: Number(teacherPasses),
      priceCents: priceCents ?? -1,
      active,
    });
    if (!parsed.success || priceCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(priceCents === null ? { priceCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      if (plan) await call('plans:update', { ...parsed.data, id: plan.id });
      else await call('plans:create', parsed.data);
      onSaved();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <TextField label="Nombre" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Pases libres"
          type="number"
          min={0}
          value={freePasses}
          onChange={(event) => setFreePasses(event.target.value)}
          error={errors.freePasses}
        />
        <TextField
          label="Pases con profesor"
          type="number"
          min={0}
          value={teacherPasses}
          onChange={(event) => setTeacherPasses(event.target.value)}
          error={errors.teacherPasses}
        />
      </div>
      <MoneyField
        label="Precio del local"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        error={errors.priceCents}
        hint="Lo que cobra el local. El recargo del profesor se suma al vender."
      />
      <CheckboxField label="Activo" checked={active} onChange={(event) => setActive(event.target.checked)} />
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Guardar plan
        </Button>
      </div>
    </form>
  );
}
