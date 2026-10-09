import type { ReactNode } from 'react';

const TONES = {
  error: 'border-danger',
  success: 'border-moss',
  warning: 'border-ochre',
  info: 'border-granite',
} as const;

export type NoticeTone = keyof typeof TONES;
export interface NoticeState {
  tone: NoticeTone;
  text: string;
}

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border-l-4 bg-paper px-4 py-3 text-sm shadow-warm ${TONES[tone]}`}>
      {children}
    </div>
  );
}
