import { type FormEvent, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { settingsInput } from '../../shared/schemas';
import { Button } from '../components/ui/Button';
import { Stat, StatRow } from '../components/ui/Card';
import { type ConfirmRequest, ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { PageBar, usePage } from '../components/ui/Pager';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { FillerRows, tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import type { AuditAction, AuditEntry, BackupStatus, ImportPreview, Settings } from '../../shared/types';
import { formatDateTime, formatMoney } from '../lib/format';
import { errorMessage, type FieldErrors, toFieldErrors } from '../lib/formErrors';
import { type FontSize, loadPreferences, type Preferences, savePreferences, type ThemePref } from '../lib/preferences';
import { type AsyncResult, useAsync } from '../lib/useAsync';

export function SettingsPage() {
  const settings = useAsync(() => call('settings:get', {}), []);
  const audit = useAsync(() => call('audit:list', {}), []);
  return (
    <section className="max-w-3xl p-8">
      <PageHeader title="Ajustes" />
      <div className="flex flex-col gap-8">
        <AppearancePanel />
        <AsyncView state={settings}>{(data) => <SettingsForm initial={data} />}</AsyncView>
        <BackupPanel onExported={audit.reload} />
        <ImportPanel onImported={audit.reload} />
        <AuditPanel state={audit} />
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

function BackupPanel({ onExported }: { onExported: () => void }) {
  const status = useAsync(() => call('backup:status', {}), []);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreRequest, setRestoreRequest] = useState<ConfirmRequest | null>(null);

  async function exportBackup() {
    setBusy(true);
    try {
      const outcome = await call('backup:export', {});
      if (outcome.status === 'done') {
        setNotice({ tone: 'success', text: `Backup guardado en ${outcome.path}` });
        onExported();
      }
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
        Cada vez que se abre y se cierra la app se guarda un backup automático: se conservan los últimos 10 y uno por día del
        último mes. Si la PC se rompe, los datos solo se recuperan con una copia fuera de ella: elegí una carpeta externa (un
        pendrive o una carpeta de Google Drive) o exportá una copia con regularidad.
      </p>
      <AsyncView state={status} skeleton={<SkeletonRows rows={2} />}>
        {(data) => <MirrorSection status={data} onChanged={status.reload} />}
      </AsyncView>
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

/** Brings in the local's spreadsheet once, into an empty database: choose the file, check the summary, import. */
function ImportPanel({ onImported }: { onImported: () => void }) {
  const headingId = useId();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  async function pick() {
    setPicking(true);
    setNotice(null);
    try {
      const outcome = await call('import:pick', {});
      if (outcome.status === 'ready') setPreview(outcome.preview);
    } catch (caught) {
      setPreview(null);
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setPicking(false);
    }
  }

  function askToImport(ready: ImportPreview) {
    setConfirm({
      title: 'Importar planilla',
      message: `Se cargan ${ready.clients} clientes, ${ready.teachers} profes y ${ready.passes} pases de ${ready.file}. Antes se guarda un backup automático.`,
      confirmLabel: 'Importar',
      action: async () => {
        const result = await call('import:run', {});
        setPreview(null);
        setNotice({ tone: 'success', text: `Listo: se importaron ${result.clients} clientes y ${result.passes} pases.` });
        onImported();
      },
    });
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-warm">
      <h2 id={headingId} className="font-display text-2xl font-semibold">
        Importar planilla
      </h2>
      <p className="text-sm text-ink-soft">
        Trae los clientes, los profes y los pases de la planilla del local (hojas PASES, Pagos Pases y Escuelita). Los pases que
        arrancaron desde el 1/1/2026 entran con lo que les queda y su deuda según los cobros. Solo se importa en una base sin
        clientes, y antes se guarda un backup.
      </p>
      {picking ? <SkeletonRows rows={3} /> : preview && <ImportSummaryView preview={preview} />}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={picking} onClick={() => void pick()}>
          {preview ? 'Elegir otra planilla' : 'Elegir planilla…'}
        </Button>
        {preview && !picking && <Button onClick={() => askToImport(preview)}>Importar</Button>}
      </div>
      <ConfirmDialog request={confirm} onDone={() => setConfirm(null)} onClose={() => setConfirm(null)} />
    </section>
  );
}

function ImportSummaryView({ preview }: { preview: ImportPreview }) {
  const listId = useId();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Planilla: <strong>{preview.file}</strong>
      </p>
      <StatRow>
        <Stat label={`Clientes (PASES ${preview.fromPases} · Escuelita ${preview.fromSchool})`}>{preview.clients}</Stat>
        <Stat label="Profes">{preview.teachers}</Stat>
        <Stat label="Pases desde 2026">{preview.passes}</Stat>
        <Stat label="Deudores">{preview.debtors}</Stat>
        <Stat label="Deuda total">{formatMoney(preview.debtCents)}</Stat>
      </StatRow>
      {preview.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 id={listId} className="font-display text-lg font-semibold">
            Para revisar ({preview.warnings.length})
          </h3>
          <p className="text-sm text-ink-soft">Se importan igual; si algo está mal, corregilo en la planilla y elegila de nuevo.</p>
          <ul aria-labelledby={listId} className="max-h-72 overflow-y-auto rounded-xl border border-ink/15 text-sm">
            {preview.warnings.map((warning, index) => (
              <li key={index} className="border-b border-ink/10 px-3 py-2 last:border-b-0">
                <span className="text-ink-soft">
                  {warning.sheet}
                  {warning.row > 0 && ` · fila ${warning.row}`}
                  {warning.name && ` · ${warning.name}`}
                </span>
                <span className="block">{warning.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The external folder every automatic backup is also copied to, and how the last copy went. */
function MirrorSection({ status, onChanged }: { status: BackupStatus; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(action: 'choose' | 'clear') {
    setBusy(true);
    setError(null);
    try {
      await call('backup:mirror', { action });
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-y border-ink/10 py-4">
      <h3 className="font-display text-lg font-semibold">Copia en una carpeta externa</h3>
      {status.mirrorDir === null ? (
        <p className="text-sm text-ink-soft">Sin carpeta: los backups quedan solo en esta PC.</p>
      ) : (
        <p className="break-all text-sm">
          Cada backup se copia también en <strong>{status.mirrorDir}</strong>.
        </p>
      )}
      {status.mirrorError && <Notice tone="error">{status.mirrorError}</Notice>}
      {status.mirrorAt && <p className="text-sm text-ink-soft">Última copia externa: {formatDateTime(status.mirrorAt)}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void change('choose')}>
          Elegir carpeta
        </Button>
        {status.mirrorDir !== null && (
          <Button variant="ghost" disabled={busy} onClick={() => void change('clear')}>
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}

const AUDIT_LABELS: Record<AuditAction, string> = {
  client_anonymized: 'Cliente anonimizado',
  data_imported: 'Planilla importada',
  backup_exported: 'Backup exportado',
  backup_restored: 'Backup restaurado',
  drive_connected: 'Google Drive conectado',
  drive_disconnected: 'Google Drive desconectado',
};
const AUDIT_PAGE_SIZE = 5;

/** The audit trail Ley 25.326 asks for: anonymizations and full copies of the data. It cannot be edited. */
function AuditPanel({ state }: { state: AsyncResult<AuditEntry[]> }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-warm">
      <div>
        <h2 id={headingId} className="font-display text-2xl font-semibold">
          Registro de auditoría
        </h2>
        <p className="text-sm text-ink-soft">
          Anonimizaciones y copias de todos los datos, como pide la Ley 25.326 de datos personales. No se puede editar ni borrar.
        </p>
      </div>
      <AsyncView state={state}>{(entries) => <AuditTable entries={entries} />}</AsyncView>
    </section>
  );
}

function AuditTable({ entries }: { entries: AuditEntry[] }) {
  const { visible, page, pages, setPage } = usePage(entries, AUDIT_PAGE_SIZE);
  return (
    <>
      <table className={tableClass}>
        <caption className="sr-only">Registro de auditoría</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Operación</th>
            <th scope="col">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <tr key={entry.id}>
              <td className="tabular-nums">{formatDateTime(entry.at)}</td>
              <td>{AUDIT_LABELS[entry.action]}</td>
              <td className="break-all">
                {entry.subjectId !== null ? (
                  <Link className="underline decoration-ochre underline-offset-4" to={`/clientes/${entry.subjectId}`}>
                    Cliente #{entry.subjectId}
                  </Link>
                ) : (
                  (entry.detail ?? '—')
                )}
              </td>
            </tr>
          ))}
          <FillerRows filled={visible.length} columns={3} empty="Todavía no hay operaciones registradas." size={AUDIT_PAGE_SIZE} />
        </tbody>
      </table>
      <PageBar keep label="Registro de auditoría" page={page} pages={pages} onChange={setPage} />
    </>
  );
}
