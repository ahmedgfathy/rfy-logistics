import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'onlight' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  onlight: 'btn-onlight',
  ghost: 'btn-ghost',
};

const sizeClass: Record<Size, string> = {
  sm: 'px-4 py-2 text-[0.8rem]',
  md: '',
  lg: 'px-6 py-3.5 text-[0.95rem]',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  icon,
  iconRight,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cn(variantClass[variant], sizeClass[size], className)} {...rest}>
      {icon}
      <span>{children}</span>
      {iconRight}
    </button>
  );
}

export function ButtonLink({
  to,
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  icon,
  iconRight,
  external,
  onClick,
  ariaLabel,
}: CommonProps & { to?: string; href?: string; external?: boolean; onClick?: () => void; ariaLabel?: string }) {
  const classes = cn(variantClass[variant], sizeClass[size], className);
  const content = (
    <>
      {icon}
      <span>{children}</span>
      {iconRight}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }

  return (
    <a
      href={href}
      className={classes}
      onClick={onClick}
      aria-label={ariaLabel}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {content}
    </a>
  );
}
