import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-cream shadow-warm hover:brightness-110',
  secondary: 'bg-dusk text-cream hover:bg-dusk-soft',
  danger: 'bg-danger text-canvas hover:brightness-110',
  ghost: 'bg-transparent text-ink hover:bg-sunken/70',
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
