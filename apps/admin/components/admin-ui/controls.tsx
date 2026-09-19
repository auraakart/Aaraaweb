'use client'

import { forwardRef, useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import styles from './admin-ui.module.css'

const cx = (...values: (string | undefined)[]) => values.filter(Boolean).join(' ')
type FieldMeta = { label: string; hint?: ReactNode; error?: string }
type InputField = FieldMeta & InputHTMLAttributes<HTMLInputElement> & { multiline?: false }
type TextareaField = FieldMeta & TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true }

function FieldFrame({ id, label, hint, error, required, children }: FieldMeta & {
  id: string; required?: boolean; children: ReactNode
}) {
  return <div className={styles.field}>
    <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {children}{hint && <div id={`${id}-hint`} className={styles.hint}>{hint}</div>}
    {error && <div id={`${id}-error`} className={styles.fieldError}>{error}</div>}
  </div>
}

// Overloads keep the ref and native event types specific to the selected control.
type FormFieldComponent = {
  (props: InputField & { ref?: React.Ref<HTMLInputElement> }): React.ReactNode
  (props: TextareaField & { ref?: React.Ref<HTMLTextAreaElement> }): React.ReactNode
}
export const FormField = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputField | TextareaField>(
  function FormField({ label, hint, error, id: suppliedId, className, ...props }, ref) {
    const generatedId = useId()
    const id = suppliedId ?? generatedId
    const describedBy = cx(props['aria-describedby'], hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined) || undefined
    const common = { id, className: cx(styles.control, className), 'aria-describedby': describedBy, 'aria-invalid': error ? true : props['aria-invalid'] }
    let control: ReactNode
    if (props.multiline) {
      const { multiline: _multiline, ...native } = props
      void _multiline
      control = <textarea {...native} {...common} ref={ref as React.Ref<HTMLTextAreaElement>} />
    } else {
      const { multiline: _multiline, ...native } = props
      void _multiline
      control = <input {...native} {...common} ref={ref as React.Ref<HTMLInputElement>} />
    }
    return <FieldFrame id={id} label={label} hint={hint} error={error} required={props.required}>{control}</FieldFrame>
  },
) as FormFieldComponent

export const SelectField = forwardRef<HTMLSelectElement, FieldMeta & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, hint, error, id: suppliedId, className, children, ...props }, ref) {
    const generatedId = useId()
    const id = suppliedId ?? generatedId
    const describedBy = cx(props['aria-describedby'], hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined) || undefined
    return <FieldFrame id={id} label={label} hint={hint} error={error} required={props.required}>
      <select {...props} id={id} ref={ref} className={cx(styles.control, className)} aria-describedby={describedBy} aria-invalid={error ? true : props['aria-invalid']}>{children}</select>
    </FieldFrame>
  },
)

export type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string }
function buttonVariant(variant: string, name: string) {
  const Button = forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
    { children, loading = false, loadingLabel = 'Working…', disabled, type = 'button', className, ...props }, ref,
  ) {
    return <button {...props} ref={ref} type={type} className={cx(styles.button, variant, className)}
      disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? loadingLabel : children}
    </button>
  })
  Button.displayName = name
  return Button
}
export const PrimaryButton = buttonVariant(styles.primaryButton, 'PrimaryButton')
export const SecondaryButton = buttonVariant(styles.secondaryButton, 'SecondaryButton')
export const DangerButton = buttonVariant(styles.dangerButton, 'DangerButton')
