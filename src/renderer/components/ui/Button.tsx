import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'outline' | 'danger-outline' | 'edit';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-cream shadow-warm hover:brightness-110',
  secondary: 'bg-dusk text-cream hover:bg-dusk-soft',
  danger: 'bg-danger text-canvas hover:brightness-110',
  // Framed: back out (Cancelar, Cerrar, Volver) or small steps (+, −). The ring is inset, so it takes no room.
  outline: 'bg-surface text-ink ring-2 ring-inset ring-ink/40 hover:bg-sunken/70 hover:ring-ink/70',
  // Framed in brick: undoes or takes something out (Anular, Quitar, Archivar). The red fill is for confirming it.
  'danger-outline': 'bg-surface text-danger ring-2 ring-inset ring-danger hover:bg-danger/10',
  edit: 'bg-ochre text-night hover:brightness-110',
};

export function buttonClass(variant: Variant = 'primary'): string {
  return `${BASE} ${VARIANTS[variant]}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
}

export function ButtonLink({ variant = 'primary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${buttonClass(variant)} ${className}`} {...props} />;
}
