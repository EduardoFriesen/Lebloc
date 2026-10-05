import { useState } from 'react';
import { errorMessage } from '../../lib/formErrors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => Promise<unknown>;
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onDone: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ request, onDone, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={request !== null} title={request?.title ?? ''} onClose={() => !busy && onClose()} dismissible={!busy}>
      {request && <ConfirmBody request={request} busy={busy} setBusy={setBusy} onDone={onDone} onClose={onClose} />}
    </Dialog>
  );
}

interface ConfirmBodyProps {
  request: ConfirmRequest;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => void;
  onClose: () => void;
}

function ConfirmBody({ request, busy, setBusy, onDone, onClose }: ConfirmBodyProps) {
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await request.action();
      setBusy(false);
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <>
      <p className="text-sm">{request.message}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
          {request.confirmLabel}
        </Button>
      </div>
    </>
  );
}
