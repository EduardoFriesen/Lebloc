import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
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
              Total adeudado <span className="text-volt-ink">{formatMoney(sum(data.map((debtor) => debtor.debtCents)))}</span>
            </p>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Fecha de venta</th>
                  <th scope="col">Antigüedad</th>
                  <th scope="col">Total</th>
                  <th scope="col">Deuda</th>
                </tr>
              </thead>
              <tbody>
                {data.map((debtor) => (
                  <tr key={debtor.saleId}>
                    <td>
                      <Link className="font-semibold underline-offset-4 hover:underline" to={`/clientes/${debtor.clientId}`}>
                        {debtor.clientName}
                      </Link>
                    </td>
                    <td>{debtor.planName}</td>
                    <td>{formatDate(debtor.soldAt)}</td>
                    <td>{debtor.daysSinceSale} días</td>
                    <td>{formatMoney(debtor.totalCents)}</td>
                    <td className="font-semibold text-volt-ink">{formatMoney(debtor.debtCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </AsyncView>
    </section>
  );
}
