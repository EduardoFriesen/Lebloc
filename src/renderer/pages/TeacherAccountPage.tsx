import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { parseMoneyInput } from '../../shared/money';
import { payoutInput } from '../../shared/schemas';
import type { PaymentMethod, TeacherAccount } from '../../shared/types';
import { Button, ButtonLink } from '../components/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState, SkeletonRows } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { formatDate, formatMoney, formatMoneyInput, fullName, PAYMENT_METHOD_LABELS, todayIso, WEEKDAY_LABELS } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function TeacherAccountPage() {
  const teacherId = Number(useParams().id);
  const account = useAsync(() => call('teachers:account', { id: teacherId }), [teacherId]);
  return (
    <section className="p-8">
      <AsyncView state={account} skeleton={<SkeletonRows rows={8} />}>
        {(data) => <TeacherAccountView account={data} reload={account.reload} />}
      </AsyncView>
    </section>
  );
}

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-5 shadow-warm">
      <dt className="text-sm font-semibold text-ink-soft">{label}</dt>
      <dd data-testid={testId} className="font-display text-4xl font-bold">
        {value}
      </dd>
      {hint && <dd className="text-xs text-ink-soft">{hint}</dd>}
    </div>
  );
}

function TeacherAccountView({ account, reload }: { account: TeacherAccount; reload: () => void }) {
  const { teacher } = account;
  const [paying, setPaying] = useState(false);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  return (
    <>
      <PageHeader
        title={fullName(teacher)}
        subtitle={`${formatMoney(teacher.classRateCents)} por clase${teacher.active ? '' : ' · Inactivo'}`}
        actions={
          <>
            <ButtonLink variant="secondary" to={`/profesores/${teacher.id}/editar`}>
              Editar
            </ButtonLink>
            <Button disabled={account.balanceCents <= 0} onClick={() => setPaying(true)}>
              Registrar liquidación
            </Button>
          </>
        }
      />
      {notice && (
        <div className="mb-6">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      <dl className="mb-8 grid gap-4 md:grid-cols-3">
        <Stat label="Generado" value={formatMoney(account.earnedCents)} hint="Su parte de los pagos ya cobrados" />
        <Stat label="Liquidado" value={formatMoney(account.paidOutCents)} />
        <Stat
          label="Saldo"
          value={formatMoney(account.balanceCents)}
          testId="teacher-balance"
          hint={account.balanceCents < 0 ? 'A favor del local' : 'Pendiente de pagar al profesor'}
        />
      </dl>

      <div className="grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="liquidaciones-title" className="flex flex-col gap-3">
          <h2 id="liquidaciones-title" className="font-display text-2xl font-semibold">
            Liquidaciones
          </h2>
          {account.payouts.length === 0 ? (
            <EmptyState title="Todavía no hay liquidaciones" />
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Medio</th>
                  <th scope="col">Monto</th>
                  <th scope="col">Nota</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {account.payouts.map((payout) => (
                  <tr key={payout.id} className={payout.voidedAt ? 'text-ink-soft' : ''}>
                    <td>{formatDate(payout.paidAt)}</td>
                    <td>{PAYMENT_METHOD_LABELS[payout.method]}</td>
                    <td>{formatMoney(payout.amountCents)}</td>
                    <td>{payout.note ?? '—'}</td>
                    <td className="text-right">
                      {payout.voidedAt ? (
                        'Anulada'
                      ) : (
                        <Button
                          variant="ghost"
                          aria-label={`Anular liquidación del ${formatDate(payout.paidAt)}`}
                          onClick={() =>
                            setPending({
                              title: 'Anular liquidación',
                              message: `Se anula la liquidación de ${formatMoney(payout.amountCents)} y el saldo del profesor vuelve a subir.`,
                              confirmLabel: 'Anular liquidación',
                              action: () => call('payouts:void', { id: payout.id }),
                            })
                          }
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

        <section aria-labelledby="cobros-title" className="flex flex-col gap-3">
          <h2 id="cobros-title" className="font-display text-2xl font-semibold">
            Cobros generados
          </h2>
          {account.shares.length === 0 ? (
            <EmptyState title="Todavía no hay cobros con este profesor" />
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Le corresponde</th>
                </tr>
              </thead>
              <tbody>
                {account.shares.map((share) => (
                  <tr key={share.paymentId}>
                    <td>{formatDate(share.paidAt)}</td>
                    <td>{share.clientName}</td>
                    <td>{share.planName}</td>
                    <td>{formatMoney(share.teacherCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section aria-labelledby="agenda-title" className="mt-8 grid gap-4 rounded-2xl bg-surface p-5 shadow-warm md:grid-cols-2">
        <h2 id="agenda-title" className="sr-only">
          Agenda y contacto
        </h2>
        <div className="text-sm">
          <h3 className="font-semibold">Horarios</h3>
          {teacher.schedules.length === 0 ? (
            <p className="text-ink-soft">Sin horarios cargados.</p>
          ) : (
            <ul>
              {teacher.schedules.map((schedule, index) => (
                <li key={index}>
                  {WEEKDAY_LABELS[schedule.weekday] ?? '?'} {schedule.startTime}–{schedule.endTime}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-sm">
          <h3 className="font-semibold">Contacto</h3>
          <p>{teacher.phone ?? 'Sin teléfono'}</p>
          <p>{teacher.address ?? 'Sin dirección'}</p>
          {teacher.socials.map((social) => (
            <p key={`${social.network}-${social.handle}`}>
              {social.network}: {social.handle}
            </p>
          ))}
        </div>
      </section>

      <Dialog open={paying} title="Registrar liquidación" onClose={() => setPaying(false)}>
        <PayoutForm
          account={account}
          onDone={() => {
            setPaying(false);
            setNotice({ tone: 'success', text: 'Liquidación registrada.' });
            reload();
          }}
          onCancel={() => setPaying(false)}
        />
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

function PayoutForm({ account, onDone, onCancel }: { account: TeacherAccount; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(formatMoneyInput(Math.max(account.balanceCents, 0)));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    const parsed = payoutInput.safeParse({ teacherId: account.teacherId, amountCents: amountCents ?? -1, method, paidAt, note });
    if (!parsed.success || amountCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(amountCents === null ? { amountCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('payouts:create', parsed.data);
      onDone();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <p className="text-sm">
        Saldo pendiente: <strong>{formatMoney(account.balanceCents)}</strong>
      </p>
      <MoneyField label="Monto" value={amount} onChange={(event) => setAmount(event.target.value)} error={errors.amountCents} />
      <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
        <option value="cash">Efectivo</option>
        <option value="transfer">Transferencia</option>
      </SelectField>
      <TextField label="Fecha" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} error={errors.paidAt} />
      <TextField label="Nota" value={note} onChange={(event) => setNote(event.target.value)} error={errors.note} />
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Confirmar liquidación
        </Button>
      </div>
    </form>
  );
}
