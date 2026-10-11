import { type FormEvent, useState } from 'react';
import { parseHoursInput, shiftCostCents } from '../../domain/staff';
import { shiftInput } from '../../shared/schemas';
import type { Employee } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { call } from '../lib/api';
import { formatMoney, fullName, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, toFieldErrors } from '../lib/formErrors';

const HOURS_ERROR = 'Ingresá las horas, por ejemplo 4,5.';

interface ShiftFormProps {
  /** Active employees only. */
  employees: Employee[];
  /** Preselected employee; the first one when null. */
  employeeId: number | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function ShiftForm({ employees, employeeId, onSaved, onCancel }: ShiftFormProps) {
  const [selectedId, setSelectedId] = useState(employeeId ?? employees[0]?.id ?? 0);
  const [workedOn, setWorkedOn] = useState(todayIso());
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minutes = parseHoursInput(hours);
  const employee = employees.find((candidate) => candidate.id === selectedId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = shiftInput.safeParse({ employeeId: selectedId, workedOn, minutes: minutes ?? 0, note });
    if (!parsed.success || minutes === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(minutes === null ? { minutes: HOURS_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('shifts:create', parsed.data);
      onSaved();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <SelectField
        label="Empleado"
        value={selectedId}
        onChange={(event) => setSelectedId(Number(event.target.value))}
        error={errors.employeeId}
      >
        {employees.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {fullName(candidate)}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Fecha"
          type="date"
          max={todayIso()}
          value={workedOn}
          onChange={(event) => setWorkedOn(event.target.value)}
          error={errors.workedOn}
        />
        <TextField
          label="Horas"
          inputMode="decimal"
          autoComplete="off"
          hint="Por ejemplo 4,5"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          error={errors.minutes}
        />
      </div>
      <p className="text-sm text-ink-soft" aria-live="polite">
        {minutes !== null && minutes > 0 && employee
          ? `Costo estimado ${formatMoney(shiftCostCents(minutes, employee.hourlyRateCents))}`
          : 'Cargá las horas para ver el costo.'}
      </p>
      <TextField label="Nota" value={note} onChange={(event) => setNote(event.target.value)} error={errors.note} />
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
