import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Field({
  label,
  htmlFor,
  required,
  error,
  help,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ms-1 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {error}
        </p>
      ) : help ? (
        <p className="field-help">{help}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn('field-input', invalid && 'field-input-error', className)}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={4}
        className={cn('field-input resize-y', invalid && 'field-input-error', className)}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn('field-input field-select appearance-none pe-9', invalid && 'field-input-error', className)}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
    );
  },
);
