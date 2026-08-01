import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// The single button primitive for the whole app, so every action shares one set
// of shapes, focus rings, and disabled behaviour. Variants map to intent:
//   primary   → the emerald brand action (New task, Create client, Save)
//   secondary → a bordered white button (toggles, cancel-adjacent actions)
//   ghost     → text-only, for low-emphasis inline actions
//   danger    → destructive confirmations (Delete)
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary:
    'border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50 hover:text-neutral-900',
  ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700'
};

const sizes: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm'
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} type={type} {...props} />
  );
}
