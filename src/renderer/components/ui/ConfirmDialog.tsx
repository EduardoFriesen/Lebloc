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
  return (
    <Dialog open={request !== null} title={request?.title ?? ''} onClose={onClose}>
      {request && <ConfirmBody request={request} onDone={onDone} onClose={onClose} />}
    </Dialog>
  );
}

function ConfirmBody({ request, onDone, onClose }: { request: ConfirmRequest; onDone: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await request.action();
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
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
          {request.confirmLabel}
        </Button>
      </div>
    </>
  );
}
