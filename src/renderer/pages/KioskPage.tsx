import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Card";
import {
  ConfirmDialog,
  type ConfirmRequest,
} from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import { CheckboxField, TextField } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { AsyncView, EmptyState } from "../components/ui/States";
import { tableClass } from "../components/ui/table";
import { call } from "../lib/api";
import { sum } from "../lib/arrays";
import { formatMoney, PAYMENT_METHOD_LABELS, todayIso } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import type { KioskSale, Product } from "../../shared/types";
import { ProductForm } from "./ProductForm";

const HEADING = "font-display text-2xl font-semibold";

export function KioskPage() {
  return (
    <section className="flex flex-col gap-10 p-8">
      <PageHeader
        title="Kiosco"
        subtitle="Productos con su precio y los tickets vendidos por día."
      />
      <ProductsBlock />
      <SalesBlock />
    </section>
  );
}

function ProductsBlock() {
  const [showInactive, setShowInactive] = useState(false);
  const products = useAsync(
    () => call("products:list", { includeInactive: showInactive }),
    [showInactive],
    { keepPreviousData: true },
  );
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={HEADING}>Productos</h2>
        <div className="flex items-center gap-4">
          <CheckboxField
            label="Mostrar inactivos"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          <Button onClick={() => setEditing("new")}>Nuevo producto</Button>
        </div>
      </div>
      <AsyncView
        state={products}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Todavía no hay productos">
            <p className="text-sm">Creá el primero con “Nuevo producto”.</p>
          </EmptyState>
        }
      >
        {(data) => (
          <table className={tableClass}>
            <caption className="sr-only">Productos</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Paquete</th>
                <th scope="col">Costo unitario</th>
                <th scope="col">Ganancia</th>
                <th scope="col">Sugerido</th>
                <th scope="col">Precio de venta</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((product) => (
                <tr
                  key={product.id}
                  className={product.active ? "" : "text-ink-soft"}
                >
                  <td className="font-semibold">
                    {product.name} {!product.active && <Badge>Inactivo</Badge>}
                  </td>
                  <td>{product.packSize} u.</td>
                  <td>{formatMoney(product.unitCostCents)}</td>
                  <td>{product.markupPercent}%</td>
                  <td>{formatMoney(product.suggestedPriceCents)}</td>
                  <td className="font-semibold">
                    {formatMoney(product.priceCents)}
                  </td>
                  <td className="text-right">
                    <Button
                      variant="edit"
                      aria-label={`Editar ${product.name}`}
                      onClick={() => setEditing(product)}
                    >
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
      <Dialog
        open={editing !== null}
        title={editing === "new" ? "Nuevo producto" : "Editar producto"}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <ProductForm
            product={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              products.reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function ticketTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SalesBlock() {
  const [date, setDate] = useState(todayIso());
  const sales = useAsync(
    () => call("kiosk:sales", { date }),
    [date],
    { keepPreviousData: true },
  );
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  function askVoid(sale: KioskSale) {
    setPending({
      title: "Anular venta",
      message: `Se anula el ticket de ${formatMoney(sale.totalCents)} de las ${ticketTime(sale.recordedAt)}. Deja de contar en el total del día.`,
      confirmLabel: "Anular venta",
      action: () => call("kiosk:void", { id: sale.id }),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className={HEADING}>Ventas</h2>
        <TextField
          label="Día"
          type="date"
          value={date}
          onChange={(event) =>
            event.target.value && setDate(event.target.value)
          }
        />
      </div>
      <AsyncView
        state={sales}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState title="No hay ventas ese día" />}
      >
        {(data) => (
          <>
            <p className="text-sm">
              Total del día:{" "}
              <strong>
                {formatMoney(
                  sum(
                    data
                      .filter((sale) => !sale.voidedAt)
                      .map((sale) => sale.totalCents),
                  ),
                )}
              </strong>
            </p>
            <table className={tableClass}>
              <caption className="sr-only">Ventas del día</caption>
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Detalle</th>
                  <th scope="col">Medio</th>
                  <th scope="col">Total</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((sale) => (
                  <tr
                    key={sale.id}
                    className={
                      sale.voidedAt ? "text-ink-soft line-through" : ""
                    }
                  >
                    <td>{ticketTime(sale.recordedAt)}</td>
                    <td>
                      {sale.items
                        .map((item) => `${item.quantity} × ${item.productName}`)
                        .join(", ")}
                    </td>
                    <td>{PAYMENT_METHOD_LABELS[sale.method]}</td>
                    <td className="font-semibold">
                      {formatMoney(sale.totalCents)}
                    </td>
                    <td className="text-right">
                      {sale.voidedAt ? (
                        <span className="inline-block no-underline"><Badge>Anulado</Badge></span>
                      ) : (
                        <Button
                          variant="ghost"
                          aria-label={`Anular ticket de las ${ticketTime(sale.recordedAt)}`}
                          onClick={() => askVoid(sale)}
                        >
                          Anular
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </AsyncView>
      <ConfirmDialog
        request={pending}
        onDone={() => {
          setPending(null);
          sales.reload();
        }}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
