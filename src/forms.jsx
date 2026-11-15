import { useCallback, useEffect, useRef, useState } from 'react';

export const SERVICE_AREA_STATES = ['NJ', 'NY', 'PA'];
export const NJ_PICKUP_AIRPORTS = ['EWR', 'TEB', 'ACY', 'TTN'];

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function parseWholeNumber(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function validateCapacityCount(value, { min, max, label }) {
  const count = parseWholeNumber(value);
  if (count === null) return `Enter a whole number for ${label}.`;
  if (count < min || count > max) return `${label} must be between ${min} and ${max}.`;
  return '';
}

export function formatTripEndpoint(reservation) {
  if (!reservation) return '—';
  return reservation.pickupLabel || reservation.pickup || reservation.destinationLabel || '—';
}

export function formatRoute(reservation) {
  if (!reservation) return '—';
  const pickup = reservation.pickupLabel || reservation.pickup || '—';
  const destination = reservation.destinationLabel || reservation.destination || '—';
  return `${pickup} → ${destination}`;
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

export function QuantityField({
  name,
  label,
  value,
  min,
  max,
  error,
  onChange,
  suggestions = [],
}) {
  const fieldId = `field-${name}`;
  const errorId = `${fieldId}-error`;
  const listId = `${fieldId}-suggestions`;

  const commit = (nextValue) => {
    onChange(String(nextValue));
  };

  return (
    <div className={`field quantity-field ${error ? 'field-invalid' : ''}`.trim()}>
      <span className="field-label" id={`${fieldId}-label`}>{label}</span>
      <div className="quantity-control">
        <button
          type="button"
          className="quantity-btn"
          aria-label={`Decrease ${label}`}
          disabled={parseWholeNumber(value) !== null && parseWholeNumber(value) <= min}
          onClick={() => {
            const current = parseWholeNumber(value);
            const next = current === null ? min : Math.max(min, current - 1);
            commit(next);
          }}
        >
          −
        </button>
        <input
          id={fieldId}
          name={name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          list={suggestions.length ? listId : undefined}
          className={error ? 'input-invalid' : undefined}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : undefined}
          aria-labelledby={`${fieldId}-label`}
          value={value}
          onChange={(event) => commit(event.target.value)}
        />
        <button
          type="button"
          className="quantity-btn"
          aria-label={`Increase ${label}`}
          disabled={parseWholeNumber(value) !== null && parseWholeNumber(value) >= max}
          onClick={() => {
            const current = parseWholeNumber(value);
            const next = current === null ? min : Math.min(max, current + 1);
            commit(next);
          }}
        >
          +
        </button>
      </div>
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((item) => <option key={item} value={item} />)}
        </datalist>
      )}
      <span className="quantity-hint">Whole numbers only · {min}–{max}</span>
      {error ? <span className="field-error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}

export function FleetVisual({ slug, name, description, image }) {
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    setShowPlaceholder(true);
    if (!image) return undefined;
    const probe = new Image();
    probe.onload = () => setShowPlaceholder(false);
    probe.onerror = () => setShowPlaceholder(true);
    probe.src = image;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [image]);

  return (
    <div className={`fleet-visual fleet-visual-${slug || 'default'}`}>
      {!showPlaceholder && image ? (
        <img src={image} alt={`${name} — ${description}`} className="fleet-visual-image" />
      ) : (
        <div className="fleet-placeholder" role="img" aria-label={`${name}: ${description}. Final vehicle photography coming soon.`}>
          <span className="fleet-placeholder-eyebrow">Aurelia Fleet</span>
          <strong>{name}</strong>
          <span>{description}</span>
        </div>
      )}
    </div>
  );
}
