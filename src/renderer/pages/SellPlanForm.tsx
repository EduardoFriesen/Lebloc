import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildSaleSnapshot, SPLIT_RULES, type SaleSnapshot, type SplitRule } from '../../domain/sale';
import { parseMoneyInput } from '../../shared/money';
import { saleInput } from '../../shared/schemas';
import type { PaymentMethod, Plan, Sale, Teacher } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { formatMoney, fullName, SPLIT_RULE_LABELS, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

interface SellPlanFormProps {
  clientId: number;
  /** Exhausted sale being renewed: preloads its plan, teacher and split rule at current prices. */
  renewFrom?: Sale;
  onDone: () => void;
  onCancel: () => void;
}

export function SellPlanForm({ clientId, renewFrom, onDone, onCancel }: SellPlanFormProps) {
  const options = useAsync(async () => {
    const [plans, teachers] = await Promise.all([call('plans:list', {}), call('teachers:list', {})]);
    return { plans, teachers };
  }, []);
  return (
    <AsyncView
      state={options}
      isEmpty={(data) => data.plans.length === 0}
      empty={
        <EmptyState title="No hay planes activos">
          <Link className="underline" to="/planes">
            Crear un plan
          </Link>
        </EmptyState>
      }
    >
      {(data) => (
        <SellPlanFields
          plans={data.plans}
          teachers={data.teachers}
          clientId={clientId}
          renewFrom={renewFrom}
          onDone={onDone}
          onCancel={onCancel}
        />
      )}
    </AsyncView>
  );
}

type Preview = { snapshot: SaleSnapshot } | { error: string } | null;

type PaymentMode = 'full' | 'partial' | 'none';

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  full: 'Pago completo',
  partial: 'Pago parcial',
  none: 'Sin pago ahora',
};

function previewSale(plan: Plan | undefined, teacher: Teacher | null, splitRule: SplitRule): Preview {
  if (!plan) return null;
  try {
    return { snapshot: buildSaleSnapshot(plan, teacher, splitRule) };
  } catch (caught) {
    return { error: errorMessage(caught) };
  }
}

function SaleBreakdown({ snapshot }: { snapshot: SaleSnapshot }) {
  return (
    <dl className="grid grid-cols-3 gap-3 border-y border-granite/15 py-3 text-sm">
      <div>
        <dt className="text-granite-soft">Parte del local</dt>
        <dd>{formatMoney(snapshot.localPriceCents)}</dd>
      </div>
      <div>
        <dt className="text-granite-soft">Recargo del profesor</dt>
        <dd>
          {snapshot.teacherPasses} × {formatMoney(snapshot.teacherRateCents)} = {formatMoney(snapshot.teacherSurchargeCents)}
        </dd>
      </div>
      <div>
        <dt className="text-granite-soft">Total</dt>
        <dd className="font-display text-2xl">{formatMoney(snapshot.totalCents)}</dd>
      </div>
    </dl>
  );
}

function SellPlanFields({ plans, teachers, clientId, renewFrom, onDone, onCancel }: SellPlanFormProps & { plans: Plan[]; teachers: Teacher[] }) {
  const renewPlan = plans.find((candidate) => candidate.id === renewFrom?.planId);
  const renewTeacher = teachers.find((candidate) => candidate.id === renewFrom?.teacherId);
  const renewUnavailable = renewFrom !== undefined && (!renewPlan || (renewFrom.teacherId !== null && !renewTeacher));
  const [planId, setPlanId] = useState(String(renewPlan?.id ?? plans[0]?.id ?? ''));
  const [teacherId, setTeacherId] = useState(String(renewTeacher?.id ?? ''));
  const [splitRule, setSplitRule] = useState<SplitRule>(renewFrom?.splitRule ?? 'proportional');
  const [soldAt, setSoldAt] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = plans.find((candidate) => candidate.id === Number(planId));
  const needsTeacher = (plan?.teacherPasses ?? 0) > 0;
  const teacher = needsTeacher ? (teachers.find((candidate) => candidate.id === Number(teacherId)) ?? null) : null;
  const preview = previewSale(plan, teacher, splitRule);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const totalCents = preview && 'snapshot' in preview ? preview.snapshot.totalCents : 0;
    const withPayment = paymentMode === 'partial' || (paymentMode === 'full' && totalCents > 0);
    const amountCents = paymentMode === 'partial' ? parseMoneyInput(amount) : totalCents;
    const invalidAmount = paymentMode === 'partial' && amountCents === null;
    const parsed = saleInput.safeParse({
      clientId,
      planId: Number(planId),
      teacherId: teacher?.id ?? null,
      splitRule: needsTeacher ? splitRule : 'proportional',
      soldAt,
      initialPayment: withPayment ? { amountCents: amountCents ?? -1, method, paidAt } : null,
    });
    if (!parsed.success || invalidAmount) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(invalidAmount ? { 'initialPayment.amountCents': MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('sales:create', parsed.data);
      onDone();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      {renewUnavailable && <Notice tone="warning">El plan o el profesor original ya no están activos; elegí otro.</Notice>}
      <SelectField label="Plan" value={planId} onChange={(event) => setPlanId(event.target.value)} error={errors.planId}>
        {plans.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </SelectField>

      {needsTeacher && (
        <>
          <SelectField label="Profesor" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            <option value="">Elegí un profesor</option>
            {teachers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {fullName(candidate)}
              </option>
            ))}
          </SelectField>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-granite-soft">Reparto de pagos</legend>
            {SPLIT_RULES.map((rule) => (
              <label key={rule} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="splitRule"
                  value={rule}
                  checked={splitRule === rule}
                  onChange={() => setSplitRule(rule)}
                  className="accent-volt"
                />
                {SPLIT_RULE_LABELS[rule]}
              </label>
            ))}
          </fieldset>
        </>
      )}

      <TextField label="Fecha de venta" type="date" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} error={errors.soldAt} />

      {preview && ('error' in preview ? <Notice tone="warning">{preview.error}</Notice> : <SaleBreakdown snapshot={preview.snapshot} />)}

      <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
        <legend className="mb-1 text-sm font-semibold text-granite-soft">Pago</legend>
        {(Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]).map((mode) => (
          <label key={mode} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="paymentMode"
              value={mode}
              checked={paymentMode === mode}
              onChange={() => setPaymentMode(mode)}
              className="accent-volt"
            />
            {PAYMENT_MODE_LABELS[mode]}
          </label>
        ))}
      </fieldset>
      {paymentMode !== 'none' && (
        <div className="grid gap-3 md:grid-cols-3">
          {paymentMode === 'partial' && (
            <MoneyField
              label="Monto del pago"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              error={errors['initialPayment.amountCents']}
            />
          )}
          <SelectField
            label="Medio de pago"
            value={method}
            onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}
          >
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </SelectField>
          <TextField
            label="Fecha del pago"
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            error={errors['initialPayment.paidAt']}
          />
        </div>
      )}

      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || preview === null || 'error' in preview}>
          Confirmar venta
        </Button>
      </div>
    </form>
  );
}
