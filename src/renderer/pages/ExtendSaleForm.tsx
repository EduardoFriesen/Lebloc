import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildExtension, extensionKindError, extensionStateOf, type SaleForExtension, type SaleSnapshot, SPLIT_RULES, type SplitRule, type TeacherForSale } from '../../domain/sale';
import { parseMoneyInput } from '../../shared/money';
import { saleExtensionInput } from '../../shared/schemas';
import type { Payment, PaymentMethod, Plan, Sale, Teacher } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { formatDate, formatMoney, fullName, SPLIT_RULE_LABELS, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';
import { type PaymentMode, PaymentModeFields } from './PaymentModeFields';

interface ExtendSaleFormProps {
  sale: Sale;
  /** The sale's payments: what they allocated has to fit in the new plan. */
  payments: Payment[];
  onDone: () => void;
  onCancel: () => void;
}

/** Turns a sale into another plan (a trial that becomes a pack): what was paid and the passes used count in it. */
export function ExtendSaleForm({ sale, payments, onDone, onCancel }: ExtendSaleFormProps) {
  const state = extensionStateOf(sale, payments);
  const options = useAsync(async () => {
    const [plans, teachers] = await Promise.all([call('plans:list', {}), call('teachers:list', {})]);
    return { plans: plans.filter((plan) => extensionKindError(state, plan) === null), teachers };
  }, []);
  return (
    <AsyncView
      state={options}
      isEmpty={(data) => data.plans.length === 0}
      empty={
        <EmptyState title="No hay planes a los que extender esta venta">
          <Link className="underline" to="/planes">
            Ver planes
          </Link>
        </EmptyState>
      }
    >
      {(data) => <ExtendSaleFields sale={sale} state={state} plans={data.plans} teachers={data.teachers} onDone={onDone} onCancel={onCancel} />}
    </AsyncView>
  );
}

type Preview = { snapshot: SaleSnapshot } | { error: string } | null;

function previewExtension(state: SaleForExtension, plan: Plan | undefined, teacher: TeacherForSale | null, splitRule: SplitRule): Preview {
  if (!plan) return null;
  try {
    return { snapshot: buildExtension(state, plan, teacher, splitRule) };
  } catch (caught) {
    return { error: errorMessage(caught) };
  }
}

interface ExtendSaleFieldsProps {
  sale: Sale;
  state: SaleForExtension;
  plans: Plan[];
  teachers: Teacher[];
  onDone: () => void;
  onCancel: () => void;
}

function ExtendSaleFields({ sale, state, plans, teachers, onDone, onCancel }: ExtendSaleFieldsProps) {
  const [planId, setPlanId] = useState(String(plans[0]?.id ?? ''));
  const [teacherId, setTeacherId] = useState('');
  const [splitRule, setSplitRule] = useState<SplitRule>(sale.splitRule);
  const [expiresAt, setExpiresAt] = useState(sale.expiresAt);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = plans.find((candidate) => candidate.id === Number(planId));
  const withTeacher = (plan?.teacherPasses ?? 0) > 0;
  // The sale's teacher stays; an inactive one is no longer listed, and the preview says why it can't go on.
  const teacher: TeacherForSale | null =
    sale.teacherId !== null
      ? (teachers.find((candidate) => candidate.id === sale.teacherId) ?? { id: sale.teacherId, active: false })
      : withTeacher
        ? (teachers.find((candidate) => candidate.id === Number(teacherId)) ?? null)
        : null;
  const rule = withTeacher ? splitRule : sale.splitRule;
  const preview = previewExtension(state, plan, teacher, rule);
  const snapshot = preview && 'snapshot' in preview ? preview.snapshot : null;
  const debtCents = snapshot ? snapshot.totalCents - sale.paidCents : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const withPayment = paymentMode === 'partial' || (paymentMode === 'full' && debtCents > 0);
    const amountCents = paymentMode === 'partial' ? parseMoneyInput(amount) : debtCents;
    const invalidAmount = paymentMode === 'partial' && amountCents === null;
    const parsed = saleExtensionInput.safeParse({
      saleId: sale.id,
      planId: Number(planId),
      teacherId: teacher?.id ?? null,
      splitRule: rule,
      expiresAt,
      payment: withPayment ? { amountCents: amountCents ?? -1, method, paidAt } : null,
    });
    if (!parsed.success || invalidAmount) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(invalidAmount ? { 'payment.amountCents': MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('sales:extend', parsed.data);
      onDone();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        {sale.planName} del {formatDate(sale.soldAt)} · pagó {formatMoney(sale.paidCents)} · usó {state.used.free} libres · {state.used.teacher} con
        profesor
      </p>
      <SelectField label="Plan" value={planId} onChange={(event) => setPlanId(event.target.value)} error={errors.planId}>
        {plans.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </SelectField>

      {sale.teacherId !== null && <p className="text-sm">Profesor: {sale.teacherName}</p>}
      {sale.teacherId === null && withTeacher && (
        <SelectField label="Profesor" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
          <option value="">Elegí un profesor</option>
          {teachers.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {fullName(candidate)}
            </option>
          ))}
        </SelectField>
      )}
      {withTeacher && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-ink-soft">Reparto de pagos</legend>
          {SPLIT_RULES.map((candidate) => (
            <label key={candidate} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="splitRule"
                value={candidate}
                checked={splitRule === candidate}
                onChange={() => setSplitRule(candidate)}
                className="accent-accent"
              />
              {SPLIT_RULE_LABELS[candidate]}
            </label>
          ))}
        </fieldset>
      )}

      <TextField
        label="Vence el"
        type="date"
        min={sale.soldAt}
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.target.value)}
        error={errors.expiresAt}
        hint="Después de esa fecha pierde los pases que le queden."
      />

      {preview && 'error' in preview && <Notice tone="warning">{preview.error}</Notice>}
      {snapshot && (
        <>
          <dl className="grid grid-cols-3 gap-3 border-y border-ink/15 py-3 text-sm">
            <div>
              <dt className="text-ink-soft">Total nuevo</dt>
              <dd>{formatMoney(snapshot.totalCents)}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Ya pagado</dt>
              <dd>{formatMoney(sale.paidCents)}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Queda debiendo</dt>
              <dd className="font-display text-2xl">{formatMoney(debtCents)}</dd>
            </div>
          </dl>
          <p className="text-sm">
            Le quedan: {snapshot.freePasses - state.used.free} libres · {snapshot.teacherPasses - state.used.teacher} con profesor
          </p>
        </>
      )}

      <PaymentModeFields
        mode={paymentMode}
        onModeChange={setPaymentMode}
        amount={amount}
        onAmountChange={setAmount}
        method={method}
        onMethodChange={setMethod}
        paidAt={paidAt}
        onPaidAtChange={setPaidAt}
        amountError={errors['payment.amountCents']}
        paidAtError={errors['payment.paidAt']}
      />

      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || snapshot === null}>
          Confirmar extensión
        </Button>
      </div>
    </form>
  );
}
