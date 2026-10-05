import { type FormEvent, useState } from 'react';
import { settingsInput } from '../../shared/schemas';
import { Button } from '../components/ui/Button';
import { type ConfirmRequest, ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { call } from '../lib/api';
import { errorMessage, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

export function SettingsPage() {
  const settings = useAsync(() => call('settings:get', {}), []);
  return (
    <section className="max-w-3xl p-8">
      <PageHeader title="Ajustes" />
      <div className="flex flex-col gap-8">
        <AsyncView state={settings}>{(data) => <ThresholdForm initial={data.lowPassesThreshold} />}</AsyncView>
        <BackupPanel />
      </div>
    </section>
  );
}

function ThresholdForm({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = settingsInput.safeParse({ lowPassesThreshold: Number(value) });
    if (!parsed.success) {
      setError(toFieldErrors(parsed.error).lowPassesThreshold);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await call('settings:update', parsed.data);
      setNotice({ tone: 'success', text: 'Ajuste guardado.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 bg-white p-6">
      <h2 className="font-display text-2xl font-bold uppercase">Aviso de pocos pases</h2>
      <TextField
        label="Avisar cuando queden pases"
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
        hint="Se avisa cuando a un cliente le quedan esta cantidad de pases o menos."
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
    <div className="flex flex-col gap-4 bg-white p-6">
      <h2 className="font-display text-2xl font-bold uppercase">Backup</h2>
      <p className="text-sm text-granite-soft">
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
