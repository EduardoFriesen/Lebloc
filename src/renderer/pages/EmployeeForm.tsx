import { type FormEvent, useState } from 'react';
import { parseMoneyInput } from '../../shared/money';
import { employeeInput } from '../../shared/schemas';
import type { Employee, EmployeeKind } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { CheckboxField, MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { call } from '../lib/api';
import { EMPLOYEE_KIND_LABELS, formatMoneyInput } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';

interface EmployeeFormProps {
  employee: Employee | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function EmployeeForm({ employee, onSaved, onCancel }: EmployeeFormProps) {
  const [firstName, setFirstName] = useState(employee?.firstName ?? '');
  const [lastName, setLastName] = useState(employee?.lastName ?? '');
  const [dni, setDni] = useState(employee?.dni ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [address, setAddress] = useState(employee?.address ?? '');
  const [kind, setKind] = useState<EmployeeKind>(employee?.kind ?? 'staff');
  const [rate, setRate] = useState(employee ? formatMoneyInput(employee.hourlyRateCents) : '');
  const [active, setActive] = useState(employee?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const hourlyRateCents = parseMoneyInput(rate);
    const parsed = employeeInput.safeParse({ firstName, lastName, dni, phone, address, kind, hourlyRateCents: hourlyRateCents ?? -1, active });
    if (!parsed.success || hourlyRateCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(hourlyRateCents === null ? { hourlyRateCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      if (employee) await call('employees:update', { ...parsed.data, id: employee.id });
      else await call('employees:create', parsed.data);
      onSaved();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Nombre" value={firstName} onChange={(event) => setFirstName(event.target.value)} error={errors.firstName} />
        <TextField label="Apellido" value={lastName} onChange={(event) => setLastName(event.target.value)} error={errors.lastName} />
        <TextField label="DNI" value={dni} onChange={(event) => setDni(event.target.value)} error={errors.dni} />
        <TextField label="Teléfono" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} error={errors.phone} />
      </div>
      <TextField label="Dirección" value={address} onChange={(event) => setAddress(event.target.value)} error={errors.address} />
      <div className="grid grid-cols-2 gap-4">
        <SelectField label="Tipo" value={kind} onChange={(event) => setKind(event.target.value as EmployeeKind)}>
          {Object.entries(EMPLOYEE_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <MoneyField label="Valor hora" value={rate} onChange={(event) => setRate(event.target.value)} error={errors.hourlyRateCents} />
      </div>
      {employee && (
        <p className="text-sm text-ink-soft">Si cambiás el valor hora, los turnos ya cargados mantienen el valor anterior.</p>
      )}
      <CheckboxField label="Activo" checked={active} onChange={(event) => setActive(event.target.checked)} />
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
