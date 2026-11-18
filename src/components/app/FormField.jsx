// src/components/app/FormField.jsx
/** Label + control + description + inline error, wired with id / aria-invalid / aria-describedby. */
import { Children, cloneElement, isValidElement, useId } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

/**
 * @param {{label: string, description?: string, error?: string | null, required?: boolean, hideLabel?: boolean,
 *   className?: string, children: import('react').ReactElement | ((control: {id: string, 'aria-invalid': boolean | undefined, 'aria-describedby': string | undefined}) => import('react').ReactNode)}} props
 *   `children` is one control (props are injected) or a function receiving the props to spread onto it.
 */
export function FormField({ label, description, error, required = false, hideLabel = false, className, children }) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [descriptionId, errorId].filter(Boolean).join(' ') || undefined,
  };
  const only = typeof children === 'function' ? null : Children.only(children);
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
        {required ? <span aria-hidden="true" className="text-destructive"> *</span> : null}
      </FieldLabel>
      {typeof children === 'function' ? children(control) : (isValidElement(only) ? cloneElement(only, { ...control, required: only.props.required ?? required }) : only)}
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}
