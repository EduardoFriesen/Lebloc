import { type ReactNode, useEffect, useId, useRef } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
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
      className="m-auto w-full max-w-xl rounded-sm border-t-4 border-volt bg-chalk p-0 text-granite shadow-2xl backdrop:bg-granite/60"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="font-display text-2xl font-bold uppercase">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
