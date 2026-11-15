import { useCallback, useRef, useState } from 'react';

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function isBannedVehicleModel(value) {
  return /infiniti\s*qx\s*80/i.test(String(value || ''));
}

export function isFuturePickup(date, time) {
  if (!date || !time) return false;
  const pickupAt = new Date(`${date}T${time}`);
  if (Number.isNaN(pickupAt.getTime())) return false;
  return pickupAt.getTime() > Date.now();
}

export function formatStatus(status) {
  return String(status || '').replaceAll('_', ' ');
}

export function shortReference(id) {
  if (!id) return '—';
  const value = String(id);
  return value.length <= 8 ? value.toUpperCase() : value.slice(0, 8).toUpperCase();
}

export function focusFirstInvalid(errors, fieldOrder = Object.keys(errors)) {
  const firstKey = fieldOrder.find((key) => errors[key]);
  if (!firstKey) return;
  const node = document.querySelector(`[name="${firstKey}"], #field-${firstKey}`);
  if (node && typeof node.focus === 'function') node.focus();
}

export function useFormErrors() {
  const [errors, setErrors] = useState({});
  const submittedRef = useRef(false);

  const clearErrors = useCallback(() => {
    setErrors({});
    submittedRef.current = false;
  }, []);

  const setFieldError = useCallback((field, message) => {
    setErrors((current) => {
      if (!message) {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      }
      return { ...current, [field]: message };
    });
  }, []);

  const applyErrors = useCallback((nextErrors, fieldOrder) => {
    submittedRef.current = true;
    setErrors(nextErrors);
    focusFirstInvalid(nextErrors, fieldOrder);
    return Object.keys(nextErrors).length === 0;
  }, []);

  const applyApiErrors = useCallback((payload, fallbackMessage = 'Please correct the highlighted fields.') => {
    const next = { ...(payload?.errors || {}) };
    if (!Object.keys(next).length && payload?.message) {
      next.form = payload.message;
    } else if (!Object.keys(next).length) {
      next.form = fallbackMessage;
    }
    submittedRef.current = true;
    setErrors(next);
    focusFirstInvalid(next);
    return next;
  }, []);

  const revalidateField = useCallback((field, value, validate) => {
    if (!submittedRef.current) return;
    const message = validate(value);
    setFieldError(field, message || null);
  }, [setFieldError]);

  return {
    errors,
    setErrors,
    clearErrors,
    setFieldError,
    applyErrors,
    applyApiErrors,
    revalidateField,
    hasSubmitted: () => submittedRef.current,
  };
}

export function Field({
  id,
  name,
  label,
  error,
  children,
  optional = false,
  className = '',
}) {
  const fieldId = id || `field-${name}`;
  const errorId = `${fieldId}-error`;
  const describedBy = error ? errorId : undefined;

  return (
    <label className={`field ${error ? 'field-invalid' : ''} ${className}`.trim()} htmlFor={fieldId}>
      <span className="field-label">
        {label}
        {optional ? <span className="optional-label">Optional</span> : null}
      </span>
      {typeof children === 'function'
        ? children({
          id: fieldId,
          name,
          className: error ? 'input-invalid' : undefined,
          'aria-invalid': error ? 'true' : 'false',
          'aria-describedby': describedBy,
        })
        : children}
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function FormBanner({ message, tone = 'error' }) {
  if (!message) return null;
  return (
    <div className={`form-banner form-banner-${tone}`} role="alert">
      {message}
    </div>
  );
}
