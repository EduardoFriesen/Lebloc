import { type FormEvent, useState } from 'react';
import { settingsInput } from '../../shared/schemas';
import { Button } from '../components/ui/Button';
import { type ConfirmRequest, ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { call } from '../lib/api';
import type { Settings } from '../../shared/types';
import { errorMessage, type FieldErrors, toFieldErrors } from '../lib/formErrors';
import { type FontSize, loadPreferences, type Preferences, savePreferences, type ThemePref } from '../lib/preferences';
import { useAsync } from '../lib/useAsync';

export function SettingsPage() {
  const settings = useAsync(() => call('settings:get', {}), []);
  return (
    <section className="max-w-3xl p-8">
      <PageHeader title="Ajustes" />
      <div className="flex flex-col gap-8">
        <AppearancePanel />
        <AsyncView state={settings}>{(data) => <SettingsForm initial={data} />}</AsyncView>
        <BackupPanel />
      </div>
    </section>
  );
}

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'auto', label: 'Automático' },
];

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Chica' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grande' },
  { value: 'xlarge', label: 'Muy grande' },
];

function AppearancePanel() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);

  function change(next: Partial<Preferences>) {
    const updated = { ...preferences, ...next };
    setPreferences(updated);
    savePreferences(updated);
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-surface p-6 shadow-warm">
      <div>
        <h2 className="font-display text-2xl font-semibold">Apariencia</h2>
        <p className="text-sm text-ink-soft">Se aplica al instante y queda guardado en esta PC. Automático sigue el tema del sistema.</p>
      </div>
      <Segmented legend="Tema" name="theme" value={preferences.theme} options={THEME_OPTIONS} onChange={(theme) => change({ theme })} />
      <Segmented
        legend="Tamaño de letra"
        name="font-size"
        value={preferences.fontSize}
        options={FONT_SIZE_OPTIONS}
        onChange={(fontSize) => change({ fontSize })}
      />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ legend, name, value, options, onChange }: SegmentedProps<T>) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink-soft">{legend}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-full bg-sunken p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold text-ink-soft transition hover:text-ink has-[:checked]:bg-accent has-[:checked]:text-cream has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-solid"
          >
            <input
              type="radio"
              className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [threshold, setThreshold] = useState(String(initial.lowPassesThreshold));
  const [waiverMonths, setWaiverMonths] = useState(String(initial.waiverValidityMonths));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = settingsInput.safeParse({ lowPassesThreshold: Number(threshold), waiverValidityMonths: Number(waiverMonths) });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await call('settings:update', parsed.data);
      setNotice({ tone: 'success', text: 'Ajustes guardados.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-warm">
      <h2 className="font-display text-2xl font-semibold">Aviso de pocos pases</h2>
      <TextField
        label="Avisar cuando queden pases"
        type="number"
        min={0}
        max={100}
        value={threshold}
        onChange={(event) => setThreshold(event.target.value)}
        error={errors.lowPassesThreshold}
        hint="Se avisa cuando a un cliente le quedan esta cantidad de pases o menos."
      />
      <h2 className="font-display text-2xl font-semibold">Ficha firmada</h2>
      <TextField
        label="Vigencia de la ficha (meses)"
        type="number"
        min={1}
        max={120}
        value={waiverMonths}
        onChange={(event) => setWaiverMonths(event.target.value)}
        error={errors.waiverValidityMonths}
        hint="Pasado este tiempo desde la firma, la ficha figura como vencida."
      />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div>
        <Button type="submit" disabled={busy}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

function BackupPanel() {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreRequest, setRestoreRequest] = useState<ConfirmRequest | null>(null);

  async function exportBackup() {
    setBusy(true);
    try {
      const outcome = await call('backup:export', {});
      if (outcome.status === 'done') setNotice({ tone: 'success', text: `Backup guardado en ${outcome.path}` });
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    const outcome = await call('backup:restore', {});
    if (outcome.status === 'done') window.location.reload();
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-warm">
      <h2 className="font-display text-2xl font-semibold">Backup</h2>
      <p className="text-sm text-ink-soft">
        Cada vez que se abre la app se guarda un backup automático (se conservan los últimos 10). Exportá una copia a un
        pendrive con regularidad: si la PC se rompe, es la única forma de recuperar los datos.
      </p>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void exportBackup()}>
          Exportar backup
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            setRestoreRequest({
              title: 'Restaurar backup',
              message:
                'Se reemplazan todos los datos actuales por los del archivo que elijas. Antes se guarda automáticamente una copia de los datos actuales.',
              confirmLabel: 'Elegir archivo y restaurar',
              action: restore,
            })
          }
        >
          Restaurar backup
        </Button>
      </div>
      <ConfirmDialog request={restoreRequest} onDone={() => setRestoreRequest(null)} onClose={() => setRestoreRequest(null)} />
    </div>
  );
}
