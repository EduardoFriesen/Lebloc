import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-volt text-granite hover:brightness-95',
  secondary: 'bg-granite text-chalk hover:bg-granite-soft',
  danger: 'bg-danger text-white hover:brightness-110',
  ghost: 'bg-transparent text-granite underline-offset-4 hover:underline',
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
