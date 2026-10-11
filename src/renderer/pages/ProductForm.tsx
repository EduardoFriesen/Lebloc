import { type FormEvent, useState } from "react";
import { suggestedPriceCents, unitCostCents } from "../../domain/kiosk";
import { parseMoneyInput } from "../../shared/money";
import { productInput } from "../../shared/schemas";
import type { Product } from "../../shared/types";
import { Button } from "../components/ui/Button";
import { CheckboxField, MoneyField, TextField } from "../components/ui/Field";
import { Notice } from "../components/ui/Notice";
import { call } from "../lib/api";
import { formatMoney, formatMoneyInput } from "../lib/format";
import {
  errorMessage,
  type FieldErrors,
  MONEY_ERROR,
  toFieldErrors,
} from "../lib/formErrors";

interface ProductFormProps {
  product: Product | null;
  onSaved: (product: Product) => void;
  onCancel: () => void;
}

export function ProductForm({ product, onSaved, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [packSize, setPackSize] = useState(String(product?.packSize ?? 1));
  const [packCost, setPackCost] = useState(
    product ? formatMoneyInput(product.packCostCents) : "",
  );
  const [markup, setMarkup] = useState(String(product?.markupPercent ?? 0));
  const [price, setPrice] = useState(
    product ? formatMoneyInput(product.priceCents) : "",
  );
  const [active, setActive] = useState(product?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const packCostCents = parseMoneyInput(packCost);
  const sizeNumber = Number(packSize);
  const markupNumber = Number(markup);
  const canPreview =
    packCostCents !== null &&
    Number.isInteger(sizeNumber) &&
    sizeNumber >= 1 &&
    Number.isFinite(markupNumber) &&
    markupNumber >= 0;
  const unitCost = canPreview ? unitCostCents(packCostCents, sizeNumber) : null;
  const suggested = canPreview
    ? suggestedPriceCents(packCostCents, sizeNumber, markupNumber)
    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const priceCents = parseMoneyInput(price);
    const parsed = productInput.safeParse({
      name,
      packSize: Number(packSize),
      packCostCents: packCostCents ?? -1,
      markupPercent: Number(markup),
      priceCents: priceCents ?? -1,
      active,
    });
    if (!parsed.success || packCostCents === null || priceCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(packCostCents === null ? { packCostCents: MONEY_ERROR } : {}),
        ...(priceCents === null ? { priceCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      onSaved(
        product
          ? await call("products:update", { ...parsed.data, id: product.id })
          : await call("products:create", parsed.data),
      );
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4"
    >
      <TextField
        label="Nombre"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errors.name}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Unidades por paquete"
          type="number"
          min={1}
          value={packSize}
          onChange={(event) => setPackSize(event.target.value)}
          error={errors.packSize}
        />
        <MoneyField
          label="Costo del paquete"
          value={packCost}
          onChange={(event) => setPackCost(event.target.value)}
          error={errors.packCostCents}
        />
      </div>
      <TextField
        label="% de ganancia"
        type="number"
        min={0}
        value={markup}
        onChange={(event) => setMarkup(event.target.value)}
        error={errors.markupPercent}
      />
      <p className="text-sm text-ink-soft" aria-live="polite">
        {unitCost === null || suggested === null
          ? "Completá unidades, costo y ganancia para ver el sugerido."
          : `Costo unitario ${formatMoney(unitCost)} · Sugerido ${formatMoney(suggested)}`}
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <MoneyField
            label="Precio de venta"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            error={errors.priceCents}
          />
        </div>
        <Button
          variant="secondary"
          disabled={suggested === null}
          onClick={() =>
            suggested !== null && setPrice(formatMoneyInput(suggested))
          }
        >
          Usar sugerido
        </Button>
      </div>
      <CheckboxField
        label="Activo"
        checked={active}
        onChange={(event) => setActive(event.target.checked)}
      />
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
