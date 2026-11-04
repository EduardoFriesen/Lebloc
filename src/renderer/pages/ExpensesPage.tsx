import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Expense, ExpenseCategory } from '../../shared/types';
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

export function ExpensesPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonthIso());
  // Picked from the summary: only this category's expenses.
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  // Open form: a new expense (repeat null) or a copy of an earlier one.
  const [form, setForm] = useState<{ repeat: Expense | null } | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const data = useAsync(() => call('expenses:month', { month }), [month], { keepPreviousData: true });
  const staff = useAsync(() => call('staff:stats', { month }), [month], { keepPreviousData: true });
  const purchases = useAsync(() => call('purchases:list', { month }), [month], { keepPreviousData: true });

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
        {category && <ClearFilter label={EXPENSE_CATEGORY_LABELS[category]} onClear={() => setCategory(null)} />}
      </div>
      <div className={SUMMARY_LIST}>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <AsyncView state={data}>
          {({ expenses }) => (
            <ExpensesTable
              key={`${month}|${category ?? ''}`}
              expenses={expenses.filter((expense) => category === null || expense.category === category)}
              empty={category ? 'Ningún gasto de esa categoría este mes' : 'No hay gastos cargados este mes. Sumá el primero con “Nuevo gasto”.'}
              onRepeat={(expense) => setForm({ repeat: expense })}
              onVoid={askVoid}
              onPaid={setPaid}
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
            label: 'Sueldos del mes',
            value: <span className="font-semibold">{staff.status === 'success' ? formatMoney(staff.data.monthCostCents) : '—'}</span>,
            onSelect: () => void navigate('/empleados'),
          },
          {
            label: 'Mercadería del kiosco',
            value: <span className="font-semibold">{purchases.status === 'success' ? formatMoney(purchases.data.totalCents) : '—'}</span>,
            onSelect: () => void navigate('/kiosco'),
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
  expenses: Expense[];
  empty: string;
  onRepeat: (expense: Expense) => void;
  onVoid: (expense: Expense) => void;
  onPaid: (expense: Expense, paid: boolean) => void;
}

/** The box by the payment method, ticked (by the box or anywhere on the row), means it was actually paid. */
function ExpensesTable({ expenses, empty, onRepeat, onVoid, onPaid }: ExpensesTableProps) {
  const { visible, page, pages, setPage } = usePage(expenses, TABLE_PAGE_SIZE);
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
          {visible.map((expense) => {
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
                <td>{expense.description ?? '—'}</td>
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
                <td className="text-right whitespace-nowrap">
                  {/* Two actions share the cell: tighter buttons keep the table inside the list beside the summary. */}
                  <Button variant="ghost" className="px-3!" aria-label={`Repetir ${label}`} onClick={() => onRepeat(expense)}>
                    Repetir
                  </Button>
                  {expense.voidedAt ? (
                    <span className="inline-block no-underline">
                      <Badge>Anulado</Badge>
                    </span>
                  ) : (
                    <Button variant="ghost" className="px-3!" aria-label={`Anular ${label}`} onClick={() => onVoid(expense)}>
                      Anular
                    </Button>
                  )}
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
