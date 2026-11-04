import { type FormEvent, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseMoneyInput } from '../../shared/money';
import { planInput } from '../../shared/schemas';
import type { CounterPrices, Plan, PlanSale } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Badge, Card, CardGrid } from '../components/ui/Card';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { CheckboxField, MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageBar, usePage } from '../components/ui/Pager';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { Stripe } from '../components/ui/Stripe';
import {
  ClearFilter,
  STICKY_HEADING,
  SUMMARY_LIST,
  SUMMARY_TOP,
  SummaryTable,
  SummaryValue,
  WITH_SUMMARY,
} from '../components/ui/SummaryTable';
import { clickRowBox, FillerRows, MARKED_ROW, ROW_BOX, TABLE_PAGE_SIZE, tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { currentMonthIso, formatDate, formatMoney, formatMoneyInput, PAYMENT_METHOD_LABELS } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function passesSummary(plan: Plan): string {
  const parts = [plan.freePasses > 0 && `${plan.freePasses} ${plan.freePasses === 1 ? 'libre' : 'libres'}`, plan.teacherPasses > 0 && `${plan.teacherPasses} con profesor`];
  return parts.filter(Boolean).join(' · ');
}

export function PlansPage() {
  // Picked from the summary: only active (true), only inactive (false) or all (null).
  const [onlyActive, setOnlyActive] = useState<boolean | null>(null);
  const plans = useAsync(() => call('plans:list', { includeInactive: true }), []);
  const shown = (data: Plan[]) => data.filter((plan) => onlyActive === null || plan.active === onlyActive);
  const stats = useAsync(() => call('plans:stats', {}), []);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  function saved() {
    setEditing(null);
    plans.reload();
    stats.reload();
  }

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader
          title="Planes"
          subtitle="Packs de pases. Si incluyen clases con profesor, su monto se suma al precio del local al vender."
          actions={<Button onClick={() => setEditing('new')}>Nuevo plan</Button>}
        />
        {onlyActive !== null && <ClearFilter label={onlyActive ? 'Activos' : 'Inactivos'} onClear={() => setOnlyActive(null)} />}
      </div>
      <div className={`${SUMMARY_LIST} flex flex-col gap-6`}>
        <CounterPricesSection />
        <AsyncView
          state={plans}
          isEmpty={(data) => shown(data).length === 0}
          empty={
            onlyActive === null ? (
              <EmptyState title="Todavía no hay planes">
                <p className="text-sm">Creá el primero con “Nuevo plan”.</p>
              </EmptyState>
            ) : (
              <EmptyState title={onlyActive ? 'No hay planes activos' : 'No hay planes inactivos'} />
            )
          }
        >
          {(data) => (
            <CardGrid label="Planes">
              {shown(data).map((plan) => (
                <Card
                  key={plan.id}
                  to={`/planes/${plan.id}`}
                  title={plan.name}
                  subtitle={passesSummary(plan)}
                  muted={!plan.active}
                  badges={!plan.active && <Badge>Inactivo</Badge>}
                  actions={
                    <Button variant="edit" aria-label={`Editar ${plan.name}`} onClick={() => setEditing(plan)}>
                      Editar
                    </Button>
                  }
                >
                  <p className="font-display text-2xl leading-tight">{formatMoney(plan.priceCents)}</p>
                  <p className="-mt-2 text-xs text-ink-soft">
                    Precio del local
                    {plan.teacherPasses > 0 &&
                      (plan.teacherAmountCents > 0 ? ` + ${formatMoney(plan.teacherAmountCents)} para el profesor` : ' · falta el monto para el profesor')}
                  </p>
                </Card>
              ))}
            </CardGrid>
          )}
        </AsyncView>
        <Stripe />
        <PlanSalesSection plans={plans.status === 'success' ? plans.data : []} />
      </div>
      <SummaryTable
        state={stats}
        rows={(data) => [
          { label: 'Activos', value: <SummaryValue count={data.active} />, onSelect: () => setOnlyActive(true), selected: onlyActive === true },
          { label: 'Inactivos', value: <SummaryValue count={data.inactive} />, onSelect: () => setOnlyActive(false), selected: onlyActive === false },
          {
            label: 'Vendidos este mes',
            value: <SummaryValue count={data.monthSales} amount={data.monthSales > 0 ? formatMoney(data.monthLocalCents) : undefined} />,
          },
        ]}
      />
      <Dialog open={editing !== null} title={editing === 'new' ? 'Nuevo plan' : 'Editar plan'} onClose={() => setEditing(null)}>
        {editing !== null && <PlanForm plan={editing === 'new' ? null : editing} onSaved={saved} onCancel={() => setEditing(null)} />}
      </Dialog>
    </section>
  );
}

export function PlanForm({ plan, onSaved, onCancel }: { plan: Plan | null; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [freePasses, setFreePasses] = useState(String(plan?.freePasses ?? 0));
  const [teacherPasses, setTeacherPasses] = useState(String(plan?.teacherPasses ?? 0));
  const [price, setPrice] = useState(plan ? formatMoneyInput(plan.priceCents) : '');
  const [teacherAmount, setTeacherAmount] = useState(plan?.teacherAmountCents ? formatMoneyInput(plan.teacherAmountCents) : '');
  const [active, setActive] = useState(plan?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasTeacher = Number(teacherPasses) > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const priceCents = parseMoneyInput(price);
    // Hidden without teacher passes: whatever was typed there doesn't count.
    const teacherAmountCents = hasTeacher ? parseMoneyInput(teacherAmount) : 0;
    const parsed = planInput.safeParse({
      name,
      freePasses: Number(freePasses),
      teacherPasses: Number(teacherPasses),
      priceCents: priceCents ?? -1,
      teacherAmountCents: teacherAmountCents ?? -1,
      active,
    });
    if (!parsed.success || priceCents === null || teacherAmountCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(priceCents === null ? { priceCents: MONEY_ERROR } : {}),
        ...(teacherAmountCents === null ? { teacherAmountCents: MONEY_ERROR } : {}),
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
        hint={hasTeacher ? 'Lo que cobra el local. Lo del profesor se suma al vender.' : 'Lo que cobra el local.'}
      />
      {hasTeacher && (
        <MoneyField
          label="Para el profesor"
          value={teacherAmount}
          onChange={(event) => setTeacherAmount(event.target.value)}
          error={errors.teacherAmountCents}
          hint={`Lo que le corresponde por las ${teacherPasses} clases. El cliente lo paga aparte del precio del local.`}
        />
      )}
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

/** Who bought which plan and when, one month at a time. */
function PlanSalesSection({ plans }: { plans: Plan[] }) {
  const headingId = useId();
  const [month, setMonth] = useState(currentMonthIso());
  const [planId, setPlanId] = useState<number | null>(null);
  const sales = useAsync(() => call('plans:sales', { month, planId: planId ?? undefined }), [month, planId], { keepPreviousData: true });
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  // Ticking saves right away; unticking asks first, in case the row was clicked by mistake.
  function setInvoiced(sale: PlanSale, invoiced: boolean) {
    if (!invoiced) {
      setPending({
        title: 'Desmarcar facturada',
        message: `La venta de ${sale.clientName} del ${formatDate(sale.soldAt)} vuelve a quedar sin facturar.`,
        confirmLabel: 'Desmarcar',
        action: () => call('sales:setInvoiced', { saleId: sale.saleId, invoiced: false }),
      });
      return;
    }
    setNotice(null);
    call('sales:setInvoiced', { saleId: sale.saleId, invoiced: true }).then(sales.reload, (caught: unknown) =>
      setNotice({ tone: 'error', text: errorMessage(caught) }),
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className={`font-display text-2xl font-semibold ${STICKY_HEADING}`}>
        Ventas
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        <TextField label="Mes" type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
        <SelectField label="Plan" value={planId ?? ''} onChange={(event) => setPlanId(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Todos los planes</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.active ? plan.name : `${plan.name} (inactivo)`}
            </option>
          ))}
        </SelectField>
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <AsyncView state={sales}>
        {(data) => (
          <PlanSalesTable
            key={`${month}|${planId ?? ''}`}
            sales={data}
            empty={planId === null ? 'No hay ventas de planes en este mes' : 'No hay ventas de este plan en este mes'}
            onInvoiced={setInvoiced}
          />
        )}
      </AsyncView>
      <ConfirmDialog
        request={pending}
        onClose={() => setPending(null)}
        onDone={() => {
          setPending(null);
          sales.reload();
        }}
      />
    </section>
  );
}

function paymentLabel(sale: PlanSale): string {
  if (sale.paidByCash && sale.paidByTransfer) return 'Efectivo y transferencia';
  if (sale.paidByCash) return PAYMENT_METHOD_LABELS.cash;
  return sale.paidByTransfer ? PAYMENT_METHOD_LABELS.transfer : '—';
}

interface PlanSalesTableProps {
  sales: PlanSale[];
  empty: string;
  onInvoiced: (sale: PlanSale, invoiced: boolean) => void;
}

/** Sales paid in full with a transfer get a box by the payment: ticked (by the box or anywhere on the row) means it was invoiced. */
function PlanSalesTable({ sales, empty, onInvoiced }: PlanSalesTableProps) {
  const { visible, page, pages, setPage } = usePage(sales, TABLE_PAGE_SIZE);
  return (
    <div className="flex flex-col gap-3">
      <table className={tableClass}>
        <caption className="sr-only">Ventas de planes del mes</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Cliente</th>
            <th scope="col">Plan</th>
            <th scope="col">Profesor</th>
            <th scope="col">Total</th>
            <th scope="col">Debe</th>
            <th scope="col">Pago</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((sale) => {
            // Paid in full (nothing owed or cancelled) with a transfer; an invoiced one keeps its box to be unticked.
            const invoiceable = (sale.paidByTransfer && sale.debtCents === 0 && sale.cancelledCents === 0) || sale.invoicedAt !== null;
            return (
              <tr
                key={sale.saleId}
                className={`${sale.invoicedAt ? MARKED_ROW : ''} ${invoiceable ? 'cursor-pointer' : ''}`}
                onClick={invoiceable ? clickRowBox : undefined}
              >
                {/* The month is picked above: day and month are enough, and keep the table within the page. */}
                <td className="tabular-nums">{formatDate(sale.soldAt).slice(0, 5)}</td>
                <td className="font-semibold">
                  <Link to={`/clientes/${sale.clientId}`} className="underline decoration-ochre underline-offset-4 hover:text-accent-ink">
                    {sale.clientName}
                  </Link>
                </td>
                <td>{sale.planName}</td>
                <td>{sale.teacherName ?? '—'}</td>
                <td className="tabular-nums">{formatMoney(sale.totalCents)}</td>
                <td className={`tabular-nums ${sale.debtCents > 0 ? 'font-semibold text-danger' : 'text-ink-soft'}`}>
                  {sale.debtCents > 0 ? formatMoney(sale.debtCents) : sale.cancelledCents > 0 ? 'Deuda cancelada' : 'Pagado'}
                </td>
                <td>
                  <span className="flex items-center gap-1.5">
                    {invoiceable && (
                      <input
                        type="checkbox"
                        className={ROW_BOX}
                        title="Facturada"
                        checked={sale.invoicedAt !== null}
                        aria-label={`Facturada: ${sale.clientName}, ${sale.planName} del ${formatDate(sale.soldAt)}`}
                        onChange={(event) => onInvoiced(sale, event.target.checked)}
                      />
                    )}
                    {paymentLabel(sale)}
                  </span>
                </td>
              </tr>
            );
          })}
          <FillerRows filled={visible.length} columns={7} empty={empty} />
        </tbody>
      </table>
      <PageBar keep label="Ventas" page={page} pages={pages} onChange={setPage} />
    </div>
  );
}

/** Prices of what the counter sells without a client: the walk-in day pass and the shoe rental. */
function CounterPricesSection() {
  const headingId = useId();
  const prices = useAsync(() => call('prices:get', {}), []);
  return (
    <section aria-labelledby={headingId} className="rounded-2xl bg-surface p-5 shadow-warm">
      <h2 id={headingId} className="mb-1 font-display text-xl font-semibold">
        Precios sueltos
      </h2>
      <p className="mb-3 text-sm text-ink-soft">Se cobran en Pases sin registrar cliente.</p>
      <AsyncView state={prices}>{(data) => <CounterPricesForm prices={data} />}</AsyncView>
    </section>
  );
}

function CounterPricesForm({ prices }: { prices: CounterPrices }) {
  const [dayPass, setDayPass] = useState(formatMoneyInput(prices.dayPassCents));
  const [shoeRental, setShoeRental] = useState(formatMoneyInput(prices.shoeRentalCents));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const dayPassCents = parseMoneyInput(dayPass);
    const shoeRentalCents = parseMoneyInput(shoeRental);
    setNotice(null);
    if (dayPassCents === null || shoeRentalCents === null) {
      setErrors({
        ...(dayPassCents === null ? { dayPassCents: MONEY_ERROR } : {}),
        ...(shoeRentalCents === null ? { shoeRentalCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await call('prices:update', { dayPassCents, shoeRentalCents });
      setNotice({ tone: 'success', text: 'Precios guardados.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4">
        <MoneyField label="Pase libre del día" value={dayPass} onChange={(event) => setDayPass(event.target.value)} error={errors.dayPassCents} />
        <MoneyField
          label="Alquiler de pédulas"
          value={shoeRental}
          onChange={(event) => setShoeRental(event.target.value)}
          error={errors.shoeRentalCents}
        />
        <Button type="submit" disabled={busy} className="mt-6">
          Guardar precios
        </Button>
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    </form>
  );
}
