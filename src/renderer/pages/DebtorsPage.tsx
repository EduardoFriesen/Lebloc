import { Card, CardGrid } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { call } from '../lib/api';
import { sum } from '../lib/arrays';
import { formatDate, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function DebtorsPage() {
  const debtors = useAsync(() => call('debtors:list', {}), []);
  return (
    <section className="p-8">
      <PageHeader title="Deudores" subtitle="Ventas con saldo pendiente, de la más antigua a la más reciente." />
      <AsyncView
        state={debtors}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Nadie debe nada">
            <p className="text-sm">Todas las ventas están saldadas.</p>
          </EmptyState>
        }
      >
        {(data) => (
          <>
            <p className="mb-4 font-display text-3xl font-semibold">
              Total adeudado <span className="text-accent-ink">{formatMoney(sum(data.map((debtor) => debtor.debtCents)))}</span>
            </p>
            <CardGrid label="Deudores">
              {data.map((debtor) => (
                <Card key={debtor.saleId} to={`/clientes/${debtor.clientId}`} title={debtor.clientName} subtitle={debtor.planName}>
                  <dl className="flex flex-wrap gap-x-6 gap-y-2">
                    <div>
                      <dt className="text-xs font-semibold text-ink-soft">Debe</dt>
                      <dd className="font-display text-2xl leading-tight text-accent-ink">{formatMoney(debtor.debtCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-ink-soft">Total</dt>
                      <dd className="font-display text-2xl leading-tight">{formatMoney(debtor.totalCents)}</dd>
                    </div>
                  </dl>
                  <p className="text-sm text-ink-soft">
                    Vendido el {formatDate(debtor.soldAt)} · hace {debtor.daysSinceSale} días
                  </p>
                </Card>
              ))}
            </CardGrid>
          </>
        )}
      </AsyncView>
    </section>
  );
}
