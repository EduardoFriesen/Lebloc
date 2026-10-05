import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isMinor } from '../../domain/client';
import { clientInput } from '../../shared/schemas';
import type { Client } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { call } from '../lib/api';
import { removeAt, replaceAt } from '../lib/arrays';
import { ageLabel, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

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

export function ClientFormPage() {
  const { id } = useParams();
  const clientId = id ? Number(id) : null;
  const client = useAsync(() => (clientId ? call('clients:get', { id: clientId }) : Promise.resolve(null)), [clientId]);
  return (
    <section className="max-w-4xl p-8">
      <PageHeader title={clientId ? 'Editar cliente' : 'Nuevo cliente'} />
      <AsyncView state={client}>{(data) => <ClientForm client={data} />}</AsyncView>
    </section>
  );
}

function ClientForm({ client }: { client: Client | null }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState({
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    birthDate: client?.birthDate ?? '',
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
      onChange: (event: ChangeEvent<HTMLInputElement>) => setFields((previous) => ({ ...previous, [name]: event.target.value })),
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
      navigate(`/clientes/${saved.id}`);
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
      <fieldset className="bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Datos personales</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre" required {...bind('firstName')} />
          <TextField label="Apellido" required {...bind('lastName')} />
          <TextField
            label="Fecha de nacimiento"
            type="date"
            required
            {...bind('birthDate')}
            hint={validBirthDate ? ageLabel(fields.birthDate) : undefined}
          />
          <TextField label="Fecha de inscripción" type="date" required {...bind('enrolledAt')} />
          <TextField label="Dirección" {...bind('address')} />
          <TextField label="Teléfono" type="tel" {...bind('phone')} />
        </div>
      </fieldset>

      <fieldset className="bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Contacto de emergencia</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Nombre del contacto" {...bind('emergencyName')} />
          <TextField label="Teléfono del contacto" type="tel" {...bind('emergencyPhone')} />
          <TextField label="Vínculo del contacto" {...bind('emergencyRelation')} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Tutores</legend>
        <p className="text-sm text-granite-soft">Obligatorio para menores de 18 años.</p>
        {minor && guardians.length === 0 && <Notice tone="warning">Es menor de edad: cargá al menos un tutor.</Notice>}
        {guardians.map((guardian, index) => {
          const n = index + 1;
          return (
            <div key={index} className="grid items-end gap-3 border-t border-granite/15 pt-4 md:grid-cols-3">
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
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Guardar cliente
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
