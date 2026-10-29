import { type FormEvent, useState } from "react";
import { suggestedPriceCents } from "../../domain/kiosk";
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
  /** Created from a delivery: the delivery sets the unit cost, so it isn't asked here and starts at $0. */
  hideCost?: boolean;
  onSaved: (product: Product) => void;
  onCancel: () => void;
}

export function ProductForm({ product, hideCost = false, onSaved, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [unitCost, setUnitCost] = useState(
    product ? formatMoneyInput(product.unitCostCents) : hideCost ? "0" : "",
  );
  const [markup, setMarkup] = useState(String(product?.markupPercent ?? 0));
  const [price, setPrice] = useState(
    product ? formatMoneyInput(product.priceCents) : "",
  );
  const [active, setActive] = useState(product?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unitCostCents = parseMoneyInput(unitCost);
  const markupNumber = Number(markup);
  // From a delivery the cost is still unknown, so there is no suggested price yet.
  const suggested =
    !hideCost && unitCostCents !== null && Number.isFinite(markupNumber) && markupNumber >= 0
      ? suggestedPriceCents(unitCostCents, markupNumber)
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const priceCents = parseMoneyInput(price);
    const parsed = productInput.safeParse({
      name,
      description,
      unitCostCents: unitCostCents ?? -1,
      markupPercent: Number(markup),
      priceCents: priceCents ?? -1,
      active,
    });
    if (!parsed.success || unitCostCents === null || priceCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(unitCostCents === null ? { unitCostCents: MONEY_ERROR } : {}),
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
      <TextField
        label="Descripción"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
      />
      <div className={hideCost ? "" : "grid grid-cols-2 gap-4"}>
        {!hideCost && (
          <MoneyField
            label="Costo unitario"
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            error={errors.unitCostCents}
          />
        )}
        <TextField
          label="% de ganancia"
          type="number"
          min={0}
          value={markup}
          onChange={(event) => setMarkup(event.target.value)}
          error={errors.markupPercent}
        />
      </div>
      <p className="text-sm text-ink-soft" aria-live="polite">
        {hideCost
          ? "El costo unitario lo pone la entrega."
          : suggested === null
            ? "Completá costo y ganancia para ver el sugerido."
            : `Sugerido ${formatMoney(suggested)}`}
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
