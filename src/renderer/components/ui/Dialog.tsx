import { type ReactNode, useEffect, useId, useRef } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** When false, Escape does nothing (e.g. while an action is running). */
  dismissible?: boolean;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, dismissible = true, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      className="m-auto w-full max-w-xl rounded-3xl border-t-4 border-accent bg-canvas p-0 text-ink shadow-2xl backdrop:bg-dusk/60"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="font-display text-2xl font-semibold">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
