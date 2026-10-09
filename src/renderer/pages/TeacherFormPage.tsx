import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { parseMoneyInput } from '../../shared/money';
import { teacherInput } from '../../shared/schemas';
import type { Social, Teacher } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { CheckboxField, MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { call } from '../lib/api';
import { removeAt, replaceAt } from '../lib/arrays';
import { formatMoneyInput, WEEKDAY_LABELS } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

interface ScheduleDraft {
  weekday: string;
  startTime: string;
  endTime: string;
}

export function TeacherFormPage() {
  const { id } = useParams();
  const teacherId = id ? Number(id) : null;
  const teacher = useAsync(() => (teacherId ? call('teachers:get', { id: teacherId }) : Promise.resolve(null)), [teacherId]);
  return (
    <section className="max-w-4xl p-8">
      <PageHeader title={teacherId ? 'Editar profesor' : 'Nuevo profesor'} />
      <AsyncView state={teacher}>{(data) => <TeacherForm teacher={data} />}</AsyncView>
    </section>
  );
}

function TeacherForm({ teacher }: { teacher: Teacher | null }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState({
    firstName: teacher?.firstName ?? '',
    lastName: teacher?.lastName ?? '',
    address: teacher?.address ?? '',
    phone: teacher?.phone ?? '',
    rate: teacher ? formatMoneyInput(teacher.classRateCents) : '',
  });
  const [active, setActive] = useState(teacher?.active ?? true);
  const [socials, setSocials] = useState<Social[]>(teacher?.socials ?? []);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(
    teacher?.schedules.map((s) => ({ weekday: String(s.weekday), startTime: s.startTime, endTime: s.endTime })) ?? [],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function bind(name: keyof typeof fields) {
    return {
      value: fields[name],
      onChange: (event: ChangeEvent<HTMLInputElement>) => setFields((previous) => ({ ...previous, [name]: event.target.value })),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const classRateCents = parseMoneyInput(fields.rate);
    const parsed = teacherInput.safeParse({
      firstName: fields.firstName,
      lastName: fields.lastName,
      address: fields.address,
      phone: fields.phone,
      socials,
      classRateCents: classRateCents ?? -1,
      active,
      schedules: schedules.map((s) => ({ weekday: Number(s.weekday), startTime: s.startTime, endTime: s.endTime })),
    });
    if (!parsed.success || classRateCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(classRateCents === null ? { classRateCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      const saved = teacher
        ? await call('teachers:update', { ...parsed.data, id: teacher.id })
        : await call('teachers:create', parsed.data);
      navigate(`/profesores/${saved.id}`, { replace: true });
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
      <fieldset className="bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Datos</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre" {...bind('firstName')} error={errors.firstName} />
          <TextField label="Apellido" {...bind('lastName')} error={errors.lastName} />
          <TextField label="Dirección" {...bind('address')} error={errors.address} />
          <TextField label="Teléfono" type="tel" {...bind('phone')} error={errors.phone} />
          <MoneyField label="Importe por clase" {...bind('rate')} error={errors.classRateCents} hint="Se usa para calcular el recargo al vender." />
          <div className="flex items-end">
            <CheckboxField label="Activo" checked={active} onChange={(event) => setActive(event.target.checked)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Días y horarios</legend>
        {schedules.map((schedule, index) => {
          const n = index + 1;
          return (
            <div key={index} className="grid items-end gap-3 md:grid-cols-4">
              <SelectField
                label={`Día ${n}`}
                value={schedule.weekday}
                onChange={(event) => setSchedules((prev) => replaceAt(prev, index, { ...schedule, weekday: event.target.value }))}
              >
                {WEEKDAY_LABELS.map((label, weekday) => (
                  <option key={label} value={weekday}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={`Desde ${n}`}
                type="time"
                value={schedule.startTime}
                onChange={(event) => setSchedules((prev) => replaceAt(prev, index, { ...schedule, startTime: event.target.value }))}
                error={errors[`schedules.${index}.startTime`]}
              />
              <TextField
                label={`Hasta ${n}`}
                type="time"
                value={schedule.endTime}
                onChange={(event) => setSchedules((prev) => replaceAt(prev, index, { ...schedule, endTime: event.target.value }))}
                error={errors[`schedules.${index}.endTime`]}
              />
              <Button variant="ghost" onClick={() => setSchedules((prev) => removeAt(prev, index))}>
                Quitar horario {n}
              </Button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" onClick={() => setSchedules((prev) => [...prev, { weekday: '1', startTime: '18:00', endTime: '20:00' }])}>
            Agregar horario
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 bg-white p-6">
        <legend className="font-display text-xl font-bold uppercase">Redes sociales</legend>
        {socials.map((social, index) => {
          const n = index + 1;
          return (
            <div key={index} className="grid items-end gap-3 md:grid-cols-3">
              <TextField
                label={`Red ${n}`}
                placeholder="Instagram"
                value={social.network}
                onChange={(event) => setSocials((prev) => replaceAt(prev, index, { ...social, network: event.target.value }))}
                error={errors[`socials.${index}.network`]}
              />
              <TextField
                label={`Usuario ${n}`}
                placeholder="@usuario"
                value={social.handle}
                onChange={(event) => setSocials((prev) => replaceAt(prev, index, { ...social, handle: event.target.value }))}
                error={errors[`socials.${index}.handle`]}
              />
              <Button variant="ghost" onClick={() => setSocials((prev) => removeAt(prev, index))}>
                Quitar red {n}
              </Button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" onClick={() => setSocials((prev) => [...prev, { network: '', handle: '' }])}>
            Agregar red
          </Button>
        </div>
      </fieldset>

      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Guardar profesor
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
