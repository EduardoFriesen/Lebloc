import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PassKind } from '../../domain/passes';
import type { Client, ClientAccount, Consumption, Payment, Sale } from '../../shared/types';
import { Button, ButtonLink } from '../components/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import {
  ageLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  fullName,
  PASS_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  SPLIT_RULE_LABELS,
} from '../lib/format';
import { errorMessage } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';
import { PaymentForm } from './PaymentForm';
import { SellPlanForm } from './SellPlanForm';

export function ClientDetailPage() {
  const clientId = Number(useParams().id);
  const account = useAsync(() => call('clients:account', { id: clientId }), [clientId]);
  return (
    <section className="p-8">
      <AsyncView state={account} skeleton={<SkeletonRows rows={8} />}>
        {(data) => <ClientAccountView account={data} reload={account.reload} />}
      </AsyncView>
    </section>
  );
}

function ClientAccountView({ account, reload }: { account: ClientAccount; reload: () => void }) {
  const { client } = account;
  const archived = client.archivedAt !== null;
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [selling, setSelling] = useState(false);
  const [payingSale, setPayingSale] = useState<Sale | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      setNotice({ tone: 'success', text: success });
      reload();
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  function consume(kind: PassKind) {
    void run(
      () => call('consumptions:create', { clientId: client.id, kind, note: null }),
      `Pase ${PASS_KIND_LABELS[kind].toLowerCase()} registrado.`,
    );
  }

  const headerActions = archived ? (
    !client.anonymizedAt && (
      <>
        <Button variant="secondary" disabled={busy} onClick={() => void run(() => call('clients:unarchive', { id: client.id }), 'Cliente desarchivado.')}>
          Desarchivar
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            setPending({
              title: 'Anonimizar cliente',
              message:
                'Se borran para siempre los datos personales y los tutores. Las ventas y los pagos se conservan para no alterar deudas ni saldos de profesores. No se puede deshacer.',
              confirmLabel: 'Anonimizar',
              action: () => call('clients:anonymize', { id: client.id }),
            })
          }
        >
          Anonimizar
        </Button>
      </>
    )
  ) : (
    <>
      <ButtonLink variant="secondary" to={`/clientes/${client.id}/editar`}>
        Editar
      </ButtonLink>
      <Button
        variant="ghost"
        onClick={() =>
          setPending({
            title: 'Archivar cliente',
            message:
              'El cliente deja de aparecer en las listas y no se le pueden vender planes ni marcar pases. Su historial se conserva y se puede desarchivar.',
            confirmLabel: 'Archivar',
            action: () => call('clients:archive', { id: client.id }),
          })
        }
      >
        Archivar
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title={fullName(client)}
        subtitle={`${ageLabel(client.birthDate)}${archived ? ' · Archivado' : ''}`}
        actions={headerActions}
      />
      {notice && (
        <div className="mb-6">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_2fr]">
        <PassesPanel account={account} disabled={archived || busy} onConsume={consume} onSell={() => setSelling(true)} />
        <div className="flex flex-col gap-8">
          <SalesPanel
            sales={account.sales}
            payments={account.payments}
            disabled={archived}
            onPay={setPayingSale}
            onVoidPayment={(payment) =>
              setPending({
                title: 'Anular pago',
                message: `Se anula el pago de ${formatMoney(payment.amountCents)} del ${formatDate(payment.paidAt)} y la deuda vuelve a subir.`,
                confirmLabel: 'Anular pago',
                action: () => call('payments:void', { id: payment.id }),
              })
            }
            onVoidSale={(sale) =>
              setPending({
                title: 'Anular venta',
                message: `Se anula la venta de “${sale.planName}”. Solo es posible si no tiene pagos ni consumos activos.`,
                confirmLabel: 'Anular venta',
                action: () => call('sales:void', { id: sale.id }),
              })
            }
          />
          <ConsumptionsPanel
            consumptions={account.consumptions}
            disabled={archived}
            onVoid={(consumption) =>
              setPending({
                title: 'Anular consumo',
                message: `Se devuelve el pase ${PASS_KIND_LABELS[consumption.kind].toLowerCase()} usado el ${formatDateTime(consumption.consumedAt)}.`,
                confirmLabel: 'Anular consumo',
                action: () => call('consumptions:void', { id: consumption.id }),
              })
            }
          />
          <ClientInfoPanel client={client} />
        </div>
      </div>

      <Dialog open={selling} title="Vender plan" onClose={() => setSelling(false)}>
        <SellPlanForm
          clientId={client.id}
          onDone={() => {
            setSelling(false);
            setNotice({ tone: 'success', text: 'Venta registrada.' });
            reload();
          }}
          onCancel={() => setSelling(false)}
        />
      </Dialog>
      <Dialog open={payingSale !== null} title="Registrar pago" onClose={() => setPayingSale(null)}>
        {payingSale && (
          <PaymentForm
            sale={payingSale}
            payments={account.payments.filter((payment) => payment.saleId === payingSale.id)}
            onDone={() => {
              setPayingSale(null);
              setNotice({ tone: 'success', text: 'Pago registrado.' });
              reload();
            }}
            onCancel={() => setPayingSale(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        request={pending}
        onDone={() => {
          setPending(null);
          reload();
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}

interface PassesPanelProps {
  account: ClientAccount;
  disabled: boolean;
  onConsume: (kind: PassKind) => void;
  onSell: () => void;
}

function PassesPanel({ account, disabled, onConsume, onSell }: PassesPanelProps) {
  return (
    <section aria-labelledby="pases-title" className="flex flex-col gap-4 self-start bg-granite p-6 text-chalk">
      <h2 id="pases-title" className="font-display text-2xl font-bold uppercase">
        Pases
      </h2>
      <p className="font-display text-6xl leading-none">
        {account.remainingFree + account.remainingTeacher}
        <span className="ml-2 font-sans text-sm uppercase tracking-wide text-chalk/70">disponibles</span>
      </p>
      <div className="flex flex-col gap-1 text-sm">
        <p>Libres restantes: {account.remainingFree}</p>
        <p>Con profesor restantes: {account.remainingTeacher}</p>
      </div>
      {account.lowOnPasses && (
        <p role="status" className="bg-volt px-3 py-2 text-sm font-semibold text-granite">
          Quedan pocos pases: ofrecé renovar el plan.
        </p>
      )}
      {account.debtCents > 0 && <p className="font-semibold text-volt">Deuda total {formatMoney(account.debtCents)}</p>}
      <div className="flex flex-col gap-2">
        <Button disabled={disabled || account.remainingFree <= 0} onClick={() => onConsume('free')}>
          Consumir libre
        </Button>
        <Button disabled={disabled || account.remainingTeacher <= 0} onClick={() => onConsume('teacher')}>
          Consumir con profesor
        </Button>
        <Button variant="secondary" className="border border-chalk/40" disabled={disabled} onClick={onSell}>
          Vender plan
        </Button>
      </div>
    </section>
  );
}

interface SalesPanelProps {
  sales: Sale[];
  payments: Payment[];
  disabled: boolean;
  onPay: (sale: Sale) => void;
  onVoidPayment: (payment: Payment) => void;
  onVoidSale: (sale: Sale) => void;
}

function SalesPanel({ sales, payments, ...actions }: SalesPanelProps) {
  return (
    <section aria-labelledby="ventas-title" className="flex flex-col gap-4">
      <h2 id="ventas-title" className="font-display text-2xl font-bold uppercase">
        Ventas
      </h2>
      {sales.length === 0 ? (
        <EmptyState title="Sin ventas todavía">
          <p className="text-sm">Usá “Vender plan” para cargar el primer pack.</p>
        </EmptyState>
      ) : (
        sales.map((sale) => (
          <SaleCard key={sale.id} sale={sale} payments={payments.filter((payment) => payment.saleId === sale.id)} {...actions} />
        ))
      )}
    </section>
  );
}

function SaleCard({ sale, payments, disabled, onPay, onVoidPayment, onVoidSale }: Omit<SalesPanelProps, 'sales'> & { sale: Sale }) {
  const voided = sale.voidedAt !== null;
  const lastActive = payments
    .filter((payment) => !payment.voidedAt)
    .reduce<Payment | null>((last, payment) => (!last || payment.id > last.id ? payment : last), null);
  const border = voided ? 'border-granite/30 opacity-70' : sale.debtCents > 0 ? 'border-volt' : 'border-moss';

  return (
    <article aria-label={`Venta ${sale.planName} del ${formatDate(sale.soldAt)}`} className={`flex flex-col gap-3 border-l-4 bg-white p-5 ${border}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-bold uppercase">{sale.planName}</h3>
        <p className="text-sm text-granite-soft">
          {formatDate(sale.soldAt)}
          {sale.teacherName && ` · con ${sale.teacherName}`}
          {voided && ' · Anulada'}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
        <div>
          <dt className="text-granite-soft">Local</dt>
          <dd>{formatMoney(sale.localPriceCents)}</dd>
        </div>
        <div>
          <dt className="text-granite-soft">Recargo profesor</dt>
          <dd>{formatMoney(sale.teacherSurchargeCents)}</dd>
        </div>
        <div>
          <dt className="text-granite-soft">Total</dt>
          <dd className="font-semibold">{formatMoney(sale.totalCents)}</dd>
        </div>
        <div>
          <dt className="text-granite-soft">Reparto</dt>
          <dd>{sale.teacherSurchargeCents > 0 ? SPLIT_RULE_LABELS[sale.splitRule] : '—'}</dd>
        </div>
      </dl>
      <p className="text-sm">
        Pases: {sale.remainingFree} libres · {sale.remainingTeacher} con profesor
      </p>
      {!voided &&
        (sale.debtCents > 0 ? (
          <p className="font-semibold text-volt-ink">Deuda: {formatMoney(sale.debtCents)}</p>
        ) : (
          <p className="font-semibold text-moss">Saldada</p>
        ))}
      {payments.length > 0 && (
        <table className={tableClass}>
          <caption className="sr-only">Pagos de la venta</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Medio</th>
              <th scope="col">Monto</th>
              <th scope="col">Local / Profesor</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className={payment.voidedAt ? 'text-granite-soft' : ''}>
                <td>{formatDate(payment.paidAt)}</td>
                <td>{PAYMENT_METHOD_LABELS[payment.method]}</td>
                <td>{formatMoney(payment.amountCents)}</td>
                <td>
                  {formatMoney(payment.localCents)} / {formatMoney(payment.teacherCents)}
                </td>
                <td>{payment.voidedAt ? 'Anulado' : 'Activo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!voided && !disabled && (
        <div className="flex flex-wrap gap-2">
          {sale.debtCents > 0 && <Button onClick={() => onPay(sale)}>Registrar pago</Button>}
          {lastActive && (
            <Button variant="ghost" onClick={() => onVoidPayment(lastActive)}>
              Anular último pago
            </Button>
          )}
          <Button variant="ghost" onClick={() => onVoidSale(sale)}>
            Anular venta
          </Button>
        </div>
      )}
    </article>
  );
}

function ConsumptionsPanel({ consumptions, disabled, onVoid }: { consumptions: Consumption[]; disabled: boolean; onVoid: (consumption: Consumption) => void }) {
  return (
    <section aria-labelledby="consumos-title" className="flex flex-col gap-4">
      <h2 id="consumos-title" className="font-display text-2xl font-bold uppercase">
        Consumos
      </h2>
      {consumptions.length === 0 ? (
        <EmptyState title="Sin consumos todavía" />
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Tipo</th>
              <th scope="col">Nota</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {consumptions.map((consumption) => (
              <tr key={consumption.id} className={consumption.voidedAt ? 'text-granite-soft' : ''}>
                <td>{formatDateTime(consumption.consumedAt)}</td>
                <td>{PASS_KIND_LABELS[consumption.kind]}</td>
                <td>{consumption.note ?? '—'}</td>
                <td>{consumption.voidedAt ? 'Anulado' : 'Activo'}</td>
                <td className="text-right">
                  {!consumption.voidedAt && !disabled && (
                    <Button
                      variant="ghost"
                      aria-label={`Anular consumo del ${formatDateTime(consumption.consumedAt)}`}
                      onClick={() => onVoid(consumption)}
                    >
                      Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ClientInfoPanel({ client }: { client: Client }) {
  const rows: [string, string][] = [
    ['Fecha de nacimiento', client.birthDate ? formatDate(client.birthDate) : '—'],
    ['Inscripción', formatDate(client.enrolledAt)],
    ['Teléfono', client.phone ?? '—'],
    ['Dirección', client.address ?? '—'],
    [
      'Emergencia',
      client.emergencyName
        ? `${client.emergencyName}${client.emergencyRelation ? ` (${client.emergencyRelation})` : ''} ${client.emergencyPhone ?? ''}`
        : '—',
    ],
    ['Última actualización', formatDateTime(client.updatedAt)],
  ];
  return (
    <section aria-labelledby="ficha-title" className="flex flex-col gap-3 bg-white p-5">
      <h2 id="ficha-title" className="font-display text-2xl font-bold uppercase">
        Ficha
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-granite-soft">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {client.guardians.length > 0 && (
        <div className="text-sm">
          <h3 className="font-semibold">Tutores</h3>
          <ul>
            {client.guardians.map((guardian) => (
              <li key={guardian.id}>
                {fullName(guardian)}
                {guardian.relation && ` (${guardian.relation})`}
                {guardian.phone && ` · ${guardian.phone}`}
                {guardian.dni && ` · DNI ${guardian.dni}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
