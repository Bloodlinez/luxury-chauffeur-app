import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

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

const FLEET_VISUAL_IDENTITY = {
  'business-class': {
    motif: 'Executive sedan',
    visualNote: 'Visual identity: black BMW 5 Series',
    prestige: 'executive',
  },
  'first-class': {
    motif: 'Flagship luxury sedan',
    visualNote: 'Visual identity: black Mercedes-Benz S-Class',
    prestige: 'flagship',
  },
  'luxury-suv': {
    motif: 'Commanding luxury SUV',
    visualNote: 'Visual identity: black Cadillac Escalade',
    prestige: 'suv',
  },
};

function FleetSilhouette({ slug }) {
  if (slug === 'luxury-suv') {
    return (
      <svg className="fleet-silhouette" viewBox="0 0 320 120" aria-hidden="true">
        <path
          d="M28 78c8-18 28-30 52-34l18-12c14-8 30-10 46-8l54 8c18 3 34 10 46 22l18 8c12 2 22 10 26 20v8H28v-12z"
          fill="currentColor"
          opacity="0.22"
        />
        <path
          d="M40 86h240M72 86c0-10 8-18 18-18s18 8 18 18M212 86c0-10 8-18 18-18s18 8 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.55"
        />
      </svg>
    );
  }

  if (slug === 'first-class') {
    return (
      <svg className="fleet-silhouette" viewBox="0 0 320 120" aria-hidden="true">
        <path
          d="M24 82c10-10 24-16 40-18l28-22c16-10 36-14 56-12l62 8c22 4 40 14 52 28l22 8c10 2 18 8 22 16v6H24v-14z"
          fill="currentColor"
          opacity="0.28"
        />
        <path
          d="M36 90h248M78 90c0-11 9-20 20-20s20 9 20 20M222 90c0-11 9-20 20-20s20 9 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.7"
        />
        <path d="M118 52h78" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      </svg>
    );
  }

  return (
    <svg className="fleet-silhouette" viewBox="0 0 320 120" aria-hidden="true">
      <path
        d="M36 84c8-8 20-14 34-16l22-16c12-8 28-10 44-8l48 6c16 3 30 11 40 22l20 6c8 2 14 8 18 14v6H36v-14z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M48 90h224M82 90c0-9 7-16 16-16s16 7 16 16M206 90c0-9 7-16 16-16s16 7 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.45"
      />
    </svg>
  );
}

export function FleetVisual({ slug, name, description, image }) {
  const src = image || (slug ? `/fleet/${slug}.jpg` : null);
  const [failed, setFailed] = useState(false);
  const identity = FLEET_VISUAL_IDENTITY[slug] || {
    motif: 'Luxury vehicle',
    visualNote: 'Final photography coming soon',
    prestige: 'default',
  };

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <div className={`fleet-visual fleet-visual-${slug || 'default'} prestige-${identity.prestige}`}>
      {showImage ? (
        <>
          <img
            src={src}
            alt={`${name} — ${description}`}
            className="fleet-visual-image"
            onError={() => setFailed(true)}
          />
          <div className="fleet-visual-overlay" />
        </>
      ) : (
        <div
          className="fleet-placeholder"
          role="img"
          aria-label={`${name}: ${description}. ${identity.visualNote}. Final vehicle photography coming soon.`}
        >
          <div className="fleet-placeholder-glow" />
          <FleetSilhouette slug={slug} />
          <div className="fleet-placeholder-copy">
            <span className="fleet-placeholder-eyebrow">{identity.motif}</span>
            <strong>{name}</strong>
            <span className="fleet-placeholder-subtitle">{description}</span>
            <em className="fleet-placeholder-identity">{identity.visualNote}</em>
          </div>
        </div>
      )}
    </div>
  );
}

export function FleetCard({ vehicle, layout = 'card' }) {
  const blurb = {
    'business-class': 'Understated executive travel for polished airport transfers and business itineraries.',
    'first-class': 'Flagship sedan comfort for guests who expect the most prestigious chauffeur experience.',
    'luxury-suv': 'Commanding cabin space for premium groups, luggage, and elevated family or executive travel.',
  }[vehicle.id] || 'Refined chauffeur travel tailored to your airport itinerary.';

  const content = (
    <>
      <div className="fleet-head">
        <div>
          <h3>{vehicle.name}</h3>
          <span>{vehicle.description}</span>
        </div>
        <strong>${vehicle.price}</strong>
      </div>
      <p className="fleet-card-copy">{blurb}</p>
      <div className="spec-row fleet-spec-row">
        <span>{vehicle.seats} passengers</span>
        <span>{vehicle.luggage} luggage</span>
      </div>
      <Link className="btn btn-primary small fleet-card-cta" to="/booking">
        Reserve {vehicle.name}
      </Link>
    </>
  );

  if (layout === 'row') {
    return (
      <article className="fleet-row">
        <FleetVisual slug={vehicle.id} name={vehicle.name} description={vehicle.description} image={vehicle.image} />
        <div className="fleet-row-body">{content}</div>
      </article>
    );
  }

  return (
    <article className={`fleet-card fleet-card-${vehicle.id}`}>
      <FleetVisual slug={vehicle.id} name={vehicle.name} description={vehicle.description} image={vehicle.image} />
      <div className="fleet-card-body">{content}</div>
    </article>
  );
}
