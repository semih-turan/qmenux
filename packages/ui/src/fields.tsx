'use client';
import { useEffect, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';
import { cx } from './primitives';

export interface ControlA11y {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown next to the field (not only in a summary), announced via aria-describedby. */
  error?: string | null;
  optional?: boolean;
  required?: boolean;
  counter?: ReactNode;
  children: (a11y: ControlA11y) => ReactNode;
}

export function Field({ label, hint, error, optional, required, counter, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="qx-field">
      <label className="qx-label" htmlFor={id}>
        {label}
        {optional && <span className="qx-label__optional"> (isteğe bağlı)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error && (
        <p className="qx-error" id={errorId}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {hint && (
        <p className="qx-hint" id={hintId}>
          {hint}
        </p>
      )}
      {counter && <span className="qx-counter">{counter}</span>}
    </div>
  );
}

/**
 * After a failed submit, focus the first invalid control: on a long phone form the error can be
 * off-screen, and focus is what makes a screen reader announce it. Each new errors value counts
 * as a new attempt, so only call setErrors on submit, never while the user types.
 */
export function useFocusFirstError<T extends HTMLElement = HTMLFormElement>(errors: Record<string, unknown> | string | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!errors || (typeof errors === 'object' && Object.keys(errors).length === 0)) return;
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  return ref;
}

type InputProps = ComponentPropsWithoutRef<'input'>;

export function Input({ className, ...rest }: InputProps) {
  return <input {...rest} className={cx('qx-input', className)} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea {...rest} className={cx('qx-textarea', className)} />;
}

/** Native select: the OS picker is the best touch UI on both iOS and Android. */
export function Select({ className, children, ...rest }: ComponentPropsWithoutRef<'select'>) {
  return (
    <div className="qx-select-wrap">
      <select {...rest} className={cx('qx-select', className)}>
        {children}
      </select>
      <ChevronDown size={18} aria-hidden="true" />
    </div>
  );
}

type Common = Omit<FieldProps, 'children'>;

export function TextField({ label, hint, error, optional, required, counter, affix, ...input }: Common & InputProps & { affix?: ReactNode }) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} counter={counter}>
      {(a11y) =>
        affix ? (
          <div className="qx-input-group">
            <Input {...input} {...a11y} />
            <span className="qx-input-group__affix" aria-hidden="true">
              {affix}
            </span>
          </div>
        ) : (
          <Input {...input} {...a11y} />
        )
      }
    </Field>
  );
}

export function TextareaField({ label, hint, error, optional, required, counter, ...rest }: Common & ComponentPropsWithoutRef<'textarea'>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} counter={counter}>
      {(a11y) => <Textarea {...rest} {...a11y} />}
    </Field>
  );
}

export function SelectField({ label, hint, error, optional, required, children, ...rest }: Common & ComponentPropsWithoutRef<'select'>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required}>
      {(a11y) => (
        <Select {...rest} {...a11y}>
          {children}
        </Select>
      )}
    </Field>
  );
}

export interface SwitchProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onChange' | 'children'> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}

/** The whole row is the control, so the touch target is the full width. */
export function Switch({ checked, onCheckedChange, label, description, className, ...rest }: SwitchProps) {
  return (
    <button {...rest} type="button" role="switch" aria-checked={checked} className={cx('qx-switch', className)} onClick={() => onCheckedChange(!checked)}>
      <span className="qx-switch__text">
        <span className="qx-switch__label">{label}</span>
        {description && <span className="qx-switch__desc">{description}</span>}
      </span>
      <span className="qx-switch__track" aria-hidden="true">
        <span className="qx-switch__thumb" />
      </span>
    </button>
  );
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

/** Radio group with roving arrow-key focus. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length]!;
    onChange(next.value);
    return next.value;
  };
  return (
    <div
      className="qx-seg"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const v = move(e.key === 'ArrowRight' ? 1 : -1);
        (e.currentTarget.querySelector(`[data-value="${CSS.escape(v)}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-value={o.value}
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className="qx-seg__opt"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
