import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isMinor } from '../../domain/client';
import { clientInput } from '../../shared/schemas';
import type { Client } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { TextAreaField, TextField } from '../components/ui/Field';
import { Dialog } from '../components/ui/Dialog';
import { Notice } from '../components/ui/Notice';
import { call } from '../lib/api';
import { removeAt, replaceAt } from '../lib/arrays';
import { ageLabel, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, toFieldErrors } from '../lib/formErrors';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_GUARDIAN = { firstName: '', lastName: '', dni: '', phone: '', relation: '' };
type GuardianDraft = typeof EMPTY_GUARDIAN;

const GUARDIAN_FIELDS: { key: keyof GuardianDraft; label: string }[] = [
  { key: 'firstName', label: 'Nombre del tutor' },
  { key: 'lastName', label: 'Apellido del tutor' },
  { key: 'dni', label: 'DNI del tutor' },
  { key: 'phone', label: 'Teléfono del tutor' },
  { key: 'relation', label: 'Vínculo del tutor' },
];

/** "Nuevo cliente" from the list or the counter: on save, go straight to the new client's account. */
export function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog wide open={open} title="Nuevo cliente" onClose={onClose}>
      <ClientForm client={null} onSaved={(saved) => navigate(`/clientes/${saved.id}`)} onCancel={onClose} />
    </Dialog>
  );
}

export function ClientForm({ client, onSaved, onCancel }: { client: Client | null; onSaved: (saved: Client) => void; onCancel: () => void }) {
  const [fields, setFields] = useState({
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    birthDate: client?.birthDate ?? '',
    dni: client?.dni ?? '',
    notes: client?.notes ?? '',
    enrolledAt: client?.enrolledAt ?? todayIso(),
    address: client?.address ?? '',
    phone: client?.phone ?? '',
    emergencyName: client?.emergencyName ?? '',
    emergencyPhone: client?.emergencyPhone ?? '',
    emergencyRelation: client?.emergencyRelation ?? '',
  });
  const [guardians, setGuardians] = useState<GuardianDraft[]>(
    client?.guardians.map((g) => ({
      firstName: g.firstName,
      lastName: g.lastName,
      dni: g.dni ?? '',
      phone: g.phone ?? '',
      relation: g.relation ?? '',
    })) ?? [],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validBirthDate = ISO_DATE.test(fields.birthDate);
  const minor = validBirthDate && isMinor(fields.birthDate, todayIso());

  function bind(name: keyof typeof fields) {
    return {
      value: fields[name],
      error: errors[name],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((previous) => ({ ...previous, [name]: event.target.value })),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = clientInput.safeParse({ ...fields, guardians });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      const saved = client
        ? await call('clients:update', { ...parsed.data, id: client.id })
        : await call('clients:create', parsed.data);
      onSaved(saved);
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
      <fieldset className="rounded-2xl bg-surface p-6 shadow-warm">
        <legend className="font-display text-xl font-semibold">Datos personales</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre" required {...bind('firstName')} />
          <TextField label="Apellido" required {...bind('lastName')} />
          <TextField label="DNI" inputMode="numeric" autoComplete="off" {...bind('dni')} />
          <TextField label="Teléfono" type="tel" {...bind('phone')} />
          <TextField
            label="Fecha de nacimiento"
            type="date"
            max={todayIso()}
            required
            {...bind('birthDate')}
            hint={validBirthDate ? ageLabel(fields.birthDate) : undefined}
          />
          <TextField label="Fecha de inscripción" type="date" max={todayIso()} required {...bind('enrolledAt')} />
          <div className="md:col-span-2">
            <TextField label="Dirección" {...bind('address')} />
          </div>
          <div className="md:col-span-2">
            <TextAreaField label="Observaciones" maxLength={1000} {...bind('notes')} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl bg-surface p-6 shadow-warm">
        <legend className="font-display text-xl font-semibold">Contacto de emergencia</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Nombre del contacto" {...bind('emergencyName')} />
          <TextField label="Teléfono del contacto" type="tel" {...bind('emergencyPhone')} />
          <TextField label="Vínculo del contacto" {...bind('emergencyRelation')} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-warm">
        <legend className="font-display text-xl font-semibold">Tutores</legend>
        <p className="text-sm text-ink-soft">Obligatorio para menores de 18 años.</p>
        {minor && guardians.length === 0 && <Notice tone="warning">Es menor de edad: cargá al menos un tutor.</Notice>}
        {guardians.map((guardian, index) => {
          const n = index + 1;
          return (
            <div key={index} className="grid items-end gap-3 border-t border-ink/15 pt-4 md:grid-cols-3">
              {GUARDIAN_FIELDS.map(({ key, label }) => (
                <TextField
                  key={key}
                  label={`${label} ${n}`}
                  value={guardian[key]}
                  error={errors[`guardians.${index}.${key}`]}
                  onChange={(event) => setGuardians((prev) => replaceAt(prev, index, { ...guardian, [key]: event.target.value }))}
                />
              ))}
              <Button variant="ghost" onClick={() => setGuardians((prev) => removeAt(prev, index))}>
                Quitar tutor {n}
              </Button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" onClick={() => setGuardians((prev) => [...prev, { ...EMPTY_GUARDIAN }])}>
            Agregar tutor
          </Button>
        </div>
      </fieldset>

      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Guardar cliente
        </Button>
      </div>
    </form>
  );
}
