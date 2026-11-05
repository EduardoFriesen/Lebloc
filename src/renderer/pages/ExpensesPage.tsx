import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Expense, ExpenseCategory, ExpenseMonth, SupplierPaymentRow } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Card';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageBar, usePage } from '../components/ui/Pager';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { ClearFilter, SUMMARY_LIST, SUMMARY_TOP, SummaryTable, SummaryValue, WITH_SUMMARY } from '../components/ui/SummaryTable';
import { clickRowBox, FillerRows, MARKED_ROW, ROW_BOX, TABLE_PAGE_SIZE, tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { currentMonthIso, EXPENSE_CATEGORY_LABELS, formatDate, formatMoney, PAYMENT_METHOD_LABELS } from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';
import { ExpenseForm } from './ExpenseForm';
import { PurchaseDetailDialog } from './PurchaseDetail';

/** The supplier payments, picked from the summary like a category. */
const MERCHANDISE = 'merchandise';
type CategoryFilter = ExpenseCategory | typeof MERCHANDISE;
const filterLabel = (filter: CategoryFilter) => (filter === MERCHANDISE ? 'Mercadería del kiosco' : EXPENSE_CATEGORY_LABELS[filter]);

type ExpenseRow = { kind: 'expense'; expense: Expense } | { kind: 'supplier'; payment: SupplierPaymentRow };

/** Expenses and supplier payments of the month, newest first, narrowed to the picked category. */
function monthRows({ expenses, supplierPayments }: ExpenseMonth, category: CategoryFilter | null): ExpenseRow[] {
  const rows: ExpenseRow[] = [
    ...expenses.filter((expense) => category === null || expense.category === category).map((expense) => ({ kind: 'expense' as const, expense })),
    ...(category === null || category === MERCHANDISE ? supplierPayments.map((payment) => ({ kind: 'supplier' as const, payment })) : []),
  ];
  const date = (row: ExpenseRow) => (row.kind === 'expense' ? row.expense.paidAt : row.payment.paidAt);
  return rows.sort((a, b) => date(b).localeCompare(date(a)));
}

export function ExpensesPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonthIso());
  // Picked from the summary: only this category's expenses, or only the supplier payments.
  const [category, setCategory] = useState<CategoryFilter | null>(null);
  // The supplier delivery whose detail is open, from one of its payments.
  const [delivery, setDelivery] = useState<number | null>(null);
  // Open form: a new expense (repeat null) or a copy of an earlier one.
  const [form, setForm] = useState<{ repeat: Expense | null } | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const data = useAsync(() => call('expenses:month', { month }), [month], { keepPreviousData: true });
  const staff = useAsync(() => call('staff:stats', { month }), [month], { keepPreviousData: true });

  function reload() {
    data.reload();
    staff.reload();
  }

  function askVoid(expense: Expense) {
    setPending({
      title: 'Anular gasto',
      message: `Se anula el gasto de ${formatMoney(expense.amountCents)} del ${formatDate(expense.paidAt)}. Deja de contar en el total del mes.`,
      confirmLabel: 'Anular gasto',
      action: () => call('expenses:void', { id: expense.id }),
    });
  }

  // Ticking saves right away; unticking asks first, in case the row was clicked by mistake.
  function setPaid(expense: Expense, paid: boolean) {
    if (!paid) {
      setPending({
        title: 'Desmarcar pagado',
        message: `El gasto de ${formatMoney(expense.amountCents)} del ${formatDate(expense.paidAt)} vuelve a quedar sin marcar como pagado.`,
        confirmLabel: 'Desmarcar',
        action: () => call('expenses:setPaid', { id: expense.id, paid: false }),
      });
      return;
    }
    setNotice(null);
    call('expenses:setPaid', { id: expense.id, paid: true }).then(data.reload, (caught: unknown) =>
      setNotice({ tone: 'error', text: errorMessage(caught) }),
    );
  }

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader
          title="Gastos"
          subtitle="Alquiler, servicios y otros costos fijos del local."
          actions={<Button onClick={() => setForm({ repeat: null })}>Nuevo gasto</Button>}
        />
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <TextField
            label="Mes"
            type="month"
            value={month}
            onChange={(event) => {
              if (!event.target.value) return;
              setMonth(event.target.value);
              setCategory(null);
            }}
          />
        </div>
        {category && <ClearFilter label={filterLabel(category)} onClear={() => setCategory(null)} />}
      </div>
      <div className={SUMMARY_LIST}>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <AsyncView state={data}>
          {(totals) => (
            <ExpensesTable
              key={`${month}|${category ?? ''}`}
              rows={monthRows(totals, category)}
              empty={
                category === MERCHANDISE
                  ? 'No se le pagó al proveedor este mes'
                  : category
                    ? 'Ningún gasto de esa categoría este mes'
                    : 'No hay gastos cargados este mes. Sumá el primero con “Nuevo gasto”.'
              }
              onRepeat={(expense) => setForm({ repeat: expense })}
              onVoid={askVoid}
              onPaid={setPaid}
              onOpenDelivery={setDelivery}
            />
          )}
        </AsyncView>
      </div>
      <SummaryTable
        state={data}
        rows={(totals) => [
          { label: 'Total del mes', value: <SummaryValue count={formatMoney(totals.totalCents)} /> },
          ...totals.byCategory.map((row) => ({
            label: EXPENSE_CATEGORY_LABELS[row.category],
            value: <span className="font-semibold">{formatMoney(row.cents)}</span>,
            onSelect: () => setCategory(row.category),
            selected: category === row.category,
          })),
          {
            label: 'Mercadería del kiosco',
            value: <span className="font-semibold">{formatMoney(totals.supplierCents)}</span>,
            onSelect: () => setCategory(MERCHANDISE),
            selected: category === MERCHANDISE,
          },
          // Shown for reference: shifts are loaded in Empleados, so they stay out of this screen's total.
          {
            label: 'Sueldos del mes',
            value: <span className="font-semibold">{staff.status === 'success' ? formatMoney(staff.data.monthCostCents) : '—'}</span>,
            onSelect: () => void navigate('/empleados'),
            hint: 'No entra en el total: se cargan en Empleados.',
          },
        ]}
      />
      <Dialog open={form !== null} title={form?.repeat ? 'Repetir gasto' : 'Nuevo gasto'} onClose={() => setForm(null)}>
        {form !== null && (
          <ExpenseForm
            repeat={form.repeat}
            onSaved={() => {
              setForm(null);
              reload();
            }}
            onCancel={() => setForm(null)}
          />
        )}
      </Dialog>
      <PurchaseDetailDialog purchaseId={delivery} onClose={() => setDelivery(null)} onChanged={data.reload} />
      <ConfirmDialog
        request={pending}
        onClose={() => setPending(null)}
        onDone={() => {
          setPending(null);
          reload();
        }}
      />
    </section>
  );
}

interface ExpensesTableProps {
  rows: ExpenseRow[];
  empty: string;
  onRepeat: (expense: Expense) => void;
  onVoid: (expense: Expense) => void;
  onPaid: (expense: Expense, paid: boolean) => void;
  /** A supplier payment's row opens its delivery. */
  onOpenDelivery: (purchaseId: number) => void;
}

/** Caps the detail's share of the width: a long one wraps instead of pushing the other columns and the buttons. */
const DETAIL = 'block max-w-40';

/** The box by the payment method, ticked (by the box or anywhere on the row), means it was actually paid. */
function ExpensesTable({ rows, empty, onRepeat, onVoid, onPaid, onOpenDelivery }: ExpensesTableProps) {
  const { visible, page, pages, setPage } = usePage(rows, TABLE_PAGE_SIZE);
  return (
    <div className="flex flex-col gap-3">
      <table className={tableClass}>
        <caption className="sr-only">Gastos del mes</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Categoría</th>
            <th scope="col">Detalle</th>
            <th scope="col">Medio</th>
            <th scope="col">Importe</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            if (row.kind === 'supplier') return <SupplierPaymentTableRow key={`s${row.payment.id}`} payment={row.payment} onOpen={onOpenDelivery} />;
            const { expense } = row;
            const label = `${EXPENSE_CATEGORY_LABELS[expense.category]} del ${formatDate(expense.paidAt)}`;
            return (
              <tr
                key={expense.id}
                className={expense.voidedAt ? 'text-ink-soft line-through' : `cursor-pointer ${expense.markedPaidAt ? MARKED_ROW : ''}`}
                onClick={expense.voidedAt ? undefined : clickRowBox}
              >
                {/* The month is picked above: day and month are enough, and keep the table within the page. */}
                <td className="tabular-nums">{formatDate(expense.paidAt).slice(0, 5)}</td>
                <td className="font-semibold">{EXPENSE_CATEGORY_LABELS[expense.category]}</td>
                <td>
                  <span className={DETAIL}>{expense.description ?? '—'}</span>
                </td>
                <td>
                  <span className="flex items-center gap-1.5">
                    {!expense.voidedAt && (
                      <input
                        type="checkbox"
                        className={ROW_BOX}
                        title="Pagado"
                        checked={expense.markedPaidAt !== null}
                        aria-label={`Pagado: ${label}`}
                        onChange={(event) => onPaid(expense, event.target.checked)}
                      />
                    )}
                    {PAYMENT_METHOD_LABELS[expense.method]}
                  </span>
                </td>
                <td className="font-semibold">{formatMoney(expense.amountCents)}</td>
                <td>
                  {/* Two actions share the cell, tighter, and may stack: the table has to fit beside the summary. */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="secondary" className="px-3!" aria-label={`Repetir ${label}`} onClick={() => onRepeat(expense)}>
                      Repetir
                    </Button>
                    {expense.voidedAt ? (
                      <span className="inline-block no-underline">
                        <Badge>Anulado</Badge>
                      </span>
                    ) : (
                      <Button variant="danger-outline" className="px-3!" aria-label={`Anular ${label}`} onClick={() => onVoid(expense)}>
                        Anular
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          <FillerRows filled={visible.length} columns={6} empty={empty} />
        </tbody>
      </table>
      <PageBar keep label="Gastos" page={page} pages={pages} onChange={setPage} />
    </div>
  );
}

/** Paid from the kiosk's deliveries: no box, no repeat or void here; the row (or "Ver") opens the delivery. */
function SupplierPaymentTableRow({ payment, onOpen }: { payment: SupplierPaymentRow; onOpen: (purchaseId: number) => void }) {
  return (
    <tr
      className="cursor-pointer"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('a, button')) onOpen(payment.purchaseId);
      }}
    >
      <td className="tabular-nums">{formatDate(payment.paidAt).slice(0, 5)}</td>
      <td className="font-semibold">Mercadería del kiosco</td>
      <td>
        <span className={DETAIL}>
          Entrega del {formatDate(payment.receivedAt).slice(0, 5)}: {payment.productsLabel}
        </span>
      </td>
      <td>{PAYMENT_METHOD_LABELS[payment.method]}</td>
      <td className="font-semibold">{formatMoney(payment.amountCents)}</td>
      <td className="text-right">
        <Button variant="secondary" className="px-3!" aria-label={`Ver entrega del ${formatDate(payment.receivedAt)}`} onClick={() => onOpen(payment.purchaseId)}>
          Ver
        </Button>
      </td>
    </tr>
  );
}
