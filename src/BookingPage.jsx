import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Field,
  FormBanner,
  formatStatus,
  isFuturePickup,
  NJ_PICKUP_AIRPORTS,
  QuantityField,
  SERVICE_AREA_STATES,
  shortReference,
  useFormErrors,
  validateCapacityCount,
} from './forms.jsx';

const emptyAddress = {
  AddressLine1: '',
  AddressLine2: '',
  City: '',
  State: 'NJ',
  Postal: '',
};

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

const defaultBooking = {
  name: '',
  phone: '',
  transferType: 'from_airport',
  pickupAirport: 'EWR',
  destinationAirport: 'JFK',
  pickup: { ...emptyAddress },
  destination: { ...emptyAddress },
  date: '',
  time: '',
  flightNumber: '',
  passengers: '2',
  luggage: '2',
  notes: '',
  category: 'Business Class',
};

function AddressFields({
  prefix,
  values,
  errors,
  onChange,
  suggestions,
  providerConfigured,
  onQueryChange,
}) {
  return (
    <div className="address-fields">
      <Field name={`${prefix}AddressLine1`} label="Street address" error={errors[`${prefix}AddressLine1`]}>
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="street-address"
            list={suggestions.length ? `${prefix}-address-suggestions` : undefined}
            value={values.AddressLine1}
            onChange={(event) => {
              onChange('AddressLine1', event.target.value);
              onQueryChange?.(event.target.value);
            }}
            placeholder="1200 Boardwalk"
          />
        )}
      </Field>
      {suggestions.length > 0 && (
        <datalist id={`${prefix}-address-suggestions`}>
          {suggestions.map((item) => (
            <option key={item.label} value={item.line1}>
              {item.label}
            </option>
          ))}
        </datalist>
      )}
      <Field name={`${prefix}AddressLine2`} label="Apt / suite" optional error={errors[`${prefix}AddressLine2`]}>
        {(props) => (
          <input {...props} type="text" value={values.AddressLine2} onChange={(event) => onChange('AddressLine2', event.target.value)} />
        )}
      </Field>
      <div className="field-grid two-col">
        <Field name={`${prefix}City`} label="City" error={errors[`${prefix}City`]}>
          {(props) => (
            <input {...props} type="text" value={values.City} onChange={(event) => onChange('City', event.target.value)} />
          )}
        </Field>
        <Field name={`${prefix}State`} label="State" error={errors[`${prefix}State`]}>
          {(props) => (
            <select {...props} value={values.State} onChange={(event) => onChange('State', event.target.value)}>
              {SERVICE_AREA_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          )}
        </Field>
      </div>
      <Field name={`${prefix}Postal`} label="ZIP code" error={errors[`${prefix}Postal`]}>
        {(props) => (
          <input {...props} type="text" inputMode="numeric" value={values.Postal} onChange={(event) => onChange('Postal', event.target.value)} />
        )}
      </Field>
      <p className="panel-copy address-note">
        {providerConfigured
          ? 'Suggestions are provided for convenience. Aurelia still validates service area from the submitted address fields and does not treat suggestions as verified geocodes.'
          : 'Enter the address manually. Autocomplete will appear once an address provider token is configured.'}
      </p>
    </div>
  );
}

export default function BookingPage({ airports, fleet, user, onBookingSuccess }) {
  const navigate = useNavigate();
  const [booking, setBooking] = useState({ ...defaultBooking, date: tomorrowDate(), time: '18:00' });
  const [steps, setSteps] = useState({ current: 1, total: 4 });
  const [submitted, setSubmitted] = useState(false);
  const [reservation, setReservation] = useState(null);
  const [quote, setQuote] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [addressProviderConfigured, setAddressProviderConfigured] = useState(false);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const { errors, clearErrors, applyErrors, applyApiErrors, revalidateField, setFieldError, setErrors } = useFormErrors();

  const njPickupAirports = useMemo(
    () => airports.filter((airport) => NJ_PICKUP_AIRPORTS.includes(airport.code)),
    [airports],
  );
  const destinationAirports = useMemo(
    () => airports.filter((airport) => SERVICE_AREA_STATES.includes(airport.state)),
    [airports],
  );
  const selectedCategory = useMemo(
    () => fleet.find((item) => item.category === booking.category) || fleet[0],
    [fleet, booking.category],
  );

  const passengerMax = selectedCategory?.seats || 4;
  const luggageMax = selectedCategory?.luggage || 3;

  useEffect(() => {
    fetch('/api/address-suggest?q=')
      .then((response) => response.json())
      .then((data) => setAddressProviderConfigured(Boolean(data.providerConfigured)))
      .catch(() => setAddressProviderConfigured(false));
  }, []);

  const requestSuggestions = async (query, target) => {
    if (!query || query.trim().length < 3) {
      if (target === 'pickup') setPickupSuggestions([]);
      else setDestinationSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`/api/address-suggest?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setAddressProviderConfigured(Boolean(data.providerConfigured));
      const next = data.suggestions || [];
      if (target === 'pickup') setPickupSuggestions(next);
      else setDestinationSuggestions(next);
    } catch {
      if (target === 'pickup') setPickupSuggestions([]);
      else setDestinationSuggestions([]);
    }
  };

  const applySuggestion = (prefix, suggestion) => {
    setBooking((current) => ({
      ...current,
      [prefix]: {
        AddressLine1: suggestion.line1 || '',
        AddressLine2: '',
        City: suggestion.city || '',
        State: suggestion.state || 'NJ',
        Postal: suggestion.postal || '',
      },
    }));
    setQuote(null);
  };

  const updateCapacity = (field, value) => {
    setBooking((current) => ({ ...current, [field]: value }));
    setQuote(null);
    const max = field === 'passengers' ? passengerMax : luggageMax;
    const min = field === 'passengers' ? 1 : 0;
    revalidateField(field, value, (next) => validateCapacityCount(next, {
      min,
      max,
      label: field === 'passengers' ? 'Passengers' : 'Luggage',
    }));
  };

  const updateCategory = (category) => {
    const nextCategory = fleet.find((item) => item.category === category) || selectedCategory;
    setBooking((current) => ({ ...current, category }));
    setQuote(null);
    const passengerError = validateCapacityCount(booking.passengers, {
      min: 1,
      max: nextCategory?.seats || 4,
      label: 'Passengers',
    });
    const luggageError = validateCapacityCount(booking.luggage, {
      min: 0,
      max: nextCategory?.luggage || 3,
      label: 'Luggage',
    });
    setErrors((current) => {
      const next = { ...current };
      if (passengerError) next.passengers = passengerError;
      else delete next.passengers;
      if (luggageError) next.luggage = luggageError;
      else delete next.luggage;
      return next;
    });
  };

  const buildTransferPayload = () => {
    if (booking.transferType === 'from_airport') {
      return {
        transferType: 'from_airport',
        pickupAirport: booking.pickupAirport,
        destinationAddressLine1: booking.destination.AddressLine1,
        destinationAddressLine2: booking.destination.AddressLine2,
        destinationCity: booking.destination.City,
        destinationState: booking.destination.State,
        destinationPostal: booking.destination.Postal,
      };
    }
    return {
      transferType: 'to_airport',
      destinationAirport: booking.destinationAirport,
      pickupAddressLine1: booking.pickup.AddressLine1,
      pickupAddressLine2: booking.pickup.AddressLine2,
      pickupCity: booking.pickup.City,
      pickupState: booking.pickup.State,
      pickupPostal: booking.pickup.Postal,
    };
  };

  const validateAddress = (prefix, values) => {
    const nextErrors = {};
    if (!values.AddressLine1.trim()) nextErrors[`${prefix}AddressLine1`] = 'Enter the street address.';
    if (!values.City.trim()) nextErrors[`${prefix}City`] = 'Enter the city.';
    if (!SERVICE_AREA_STATES.includes(values.State)) nextErrors[`${prefix}State`] = 'Address must be in New Jersey, New York, or Pennsylvania.';
    if (!values.Postal.trim()) nextErrors[`${prefix}Postal`] = 'Enter the ZIP code.';
    else if (!/^\d{5}(-\d{4})?$/.test(values.Postal.trim())) nextErrors[`${prefix}Postal`] = 'Enter a valid ZIP code.';
    return nextErrors;
  };

  const validateStep = (step) => {
    const nextErrors = {};
    if (step === 1) {
      if (!['from_airport', 'to_airport'].includes(booking.transferType)) {
        nextErrors.transferType = 'Choose From Airport or To Airport.';
      }
      if (booking.transferType === 'from_airport') {
        if (!NJ_PICKUP_AIRPORTS.includes(booking.pickupAirport)) {
          nextErrors.pickupAirport = 'Select an approved New Jersey pickup airport (EWR, TEB, ACY, or TTN).';
        }
        Object.assign(nextErrors, validateAddress('destination', booking.destination));
      } else {
        Object.assign(nextErrors, validateAddress('pickup', booking.pickup));
        const airport = destinationAirports.find((item) => item.code === booking.destinationAirport);
        if (!airport) nextErrors.destinationAirport = 'Select an approved destination airport.';
      }
      if (!booking.date) nextErrors.date = 'Choose a pickup date.';
      if (!booking.time) nextErrors.time = 'Choose a pickup time.';
      if (booking.date && booking.time && !isFuturePickup(booking.date, booking.time)) {
        nextErrors.date = 'Pickup must be scheduled in the future.';
        nextErrors.time = 'Choose a pickup time later than now.';
      }
    }
    if (step === 2) {
      if (!selectedCategory) nextErrors.category = 'Select a vehicle category.';
      const passengerError = validateCapacityCount(booking.passengers, { min: 1, max: passengerMax, label: 'Passengers' });
      const luggageError = validateCapacityCount(booking.luggage, { min: 0, max: luggageMax, label: 'Luggage' });
      if (passengerError) nextErrors.passengers = passengerError;
      if (luggageError) nextErrors.luggage = luggageError;
    }
    if (step === 3) {
      if (!booking.name.trim()) nextErrors.name = 'Enter the lead passenger name.';
      if (!booking.phone.trim()) nextErrors.phone = 'Enter a mobile number for day-of coordination.';
      if (!user) nextErrors.form = 'Sign in to continue with passenger details tied to your account.';
    }
    return applyErrors(nextErrors, [
      'transferType', 'pickupAirport', 'destinationAirport',
      'pickupAddressLine1', 'pickupCity', 'pickupState', 'pickupPostal',
      'destinationAddressLine1', 'destinationCity', 'destinationState', 'destinationPostal',
      'date', 'time', 'category', 'passengers', 'luggage', 'name', 'phone',
    ]);
  };

  const handleContinue = async () => {
    if (!validateStep(steps.current)) return;
    if (steps.current === 3) {
      setIsQuoting(true);
      try {
        const response = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...buildTransferPayload(),
            vehicleId: selectedCategory.id,
            passengers: booking.passengers,
            luggage: booking.luggage,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          applyApiErrors(data, 'Unable to calculate a quote.');
          return;
        }
        setQuote(data.quote);
        clearErrors();
        setSteps((current) => ({ ...current, current: 4 }));
      } catch {
        applyApiErrors({ message: 'Unable to reach pricing services. Please try again.' });
      } finally {
        setIsQuoting(false);
      }
      return;
    }
    clearErrors();
    setSteps((current) => ({ ...current, current: current.current + 1 }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    if (!quote) {
      setFieldError('form', 'Refresh the quote before submitting your request.');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...buildTransferPayload(),
          name: booking.name,
          phone: booking.phone,
          date: booking.date,
          time: booking.time,
          flightNumber: booking.flightNumber,
          notes: booking.notes,
          passengers: booking.passengers,
          luggage: booking.luggage,
          vehicleId: selectedCategory.id,
          category: selectedCategory.category,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        applyApiErrors(data, 'Unable to submit reservation.');
        return;
      }
      setReservation(data.reservation);
      setQuote(data.quote || quote);
      setSubmitted(true);
      clearErrors();
      onBookingSuccess();
    } catch {
      applyApiErrors({ message: 'Network error while submitting. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const routeSummary = booking.transferType === 'from_airport'
    ? `${booking.pickupAirport} → ${[booking.destination.AddressLine1, booking.destination.City, booking.destination.State].filter(Boolean).join(', ')}`
    : `${[booking.pickup.AddressLine1, booking.pickup.City, booking.pickup.State].filter(Boolean).join(', ')} → ${booking.destinationAirport}`;

  return (
    <main className="page-shell booking-layout">
      <div className="booking-form-panel">
        <div className="section-head left">
          <span className="eyebrow">Reserve your journey</span>
          <h2>Airport chauffeur booking.</h2>
          <p className="panel-copy">Choose From Airport or To Airport. Street addresses are welcome within New Jersey, New York City, and Pennsylvania service areas.</p>
        </div>

        <div className="booking-progress" aria-label="Reservation steps">
          {['Route', 'Vehicle', 'Passenger', 'Review'].map((label, index) => {
            const step = index + 1;
            return (
              <button
                type="button"
                key={label}
                className={`booking-step ${steps.current === step ? 'active' : ''} ${steps.current > step ? 'complete' : ''}`}
                disabled={step > steps.current}
                onClick={() => {
                  clearErrors();
                  setSteps((current) => ({ ...current, current: step }));
                }}
              >
                <span>0{step}</span>{label}
              </button>
            );
          })}
        </div>

        {!submitted ? (
          <form className="booking-form" onSubmit={handleSubmit} noValidate>
            {steps.current === 1 && (
              <>
                <fieldset className="transfer-type-fieldset">
                  <legend>Journey type</legend>
                  <div className="transfer-type-grid">
                    <label className={`transfer-type-card ${booking.transferType === 'from_airport' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="transferType"
                        value="from_airport"
                        checked={booking.transferType === 'from_airport'}
                        onChange={() => {
                          setBooking((current) => ({ ...current, transferType: 'from_airport' }));
                          setQuote(null);
                          revalidateField('transferType', 'from_airport', () => '');
                        }}
                      />
                      <strong>From Airport</strong>
                      <span>NJ airport pickup to a street address or venue</span>
                    </label>
                    <label className={`transfer-type-card ${booking.transferType === 'to_airport' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="transferType"
                        value="to_airport"
                        checked={booking.transferType === 'to_airport'}
                        onChange={() => {
                          setBooking((current) => ({ ...current, transferType: 'to_airport' }));
                          setQuote(null);
                          revalidateField('transferType', 'to_airport', () => '');
                        }}
                      />
                      <strong>To Airport</strong>
                      <span>Street address pickup to an approved airport</span>
                    </label>
                  </div>
                  {errors.transferType && <span className="field-error" role="alert">{errors.transferType}</span>}
                </fieldset>

                {booking.transferType === 'from_airport' ? (
                  <>
                    <Field name="pickupAirport" label="Pickup airport" error={errors.pickupAirport}>
                      {(props) => (
                        <select
                          {...props}
                          value={booking.pickupAirport}
                          onChange={(event) => {
                            setBooking((current) => ({ ...current, pickupAirport: event.target.value }));
                            setQuote(null);
                          }}
                        >
                          {njPickupAirports.map((airport) => (
                            <option key={airport.code} value={airport.code}>{airport.code} — {airport.name}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <AddressFields
                      prefix="destination"
                      values={booking.destination}
                      errors={errors}
                      suggestions={destinationSuggestions}
                      providerConfigured={addressProviderConfigured}
                      onQueryChange={(query) => requestSuggestions(query, 'destination')}
                      onChange={(field, value) => {
                        setBooking((current) => ({
                          ...current,
                          destination: { ...current.destination, [field]: value },
                        }));
                        setQuote(null);
                        const suggestion = destinationSuggestions.find((item) => item.line1 === value);
                        if (suggestion && field === 'AddressLine1') applySuggestion('destination', suggestion);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <AddressFields
                      prefix="pickup"
                      values={booking.pickup}
                      errors={errors}
                      suggestions={pickupSuggestions}
                      providerConfigured={addressProviderConfigured}
                      onQueryChange={(query) => requestSuggestions(query, 'pickup')}
                      onChange={(field, value) => {
                        setBooking((current) => ({
                          ...current,
                          pickup: { ...current.pickup, [field]: value },
                        }));
                        setQuote(null);
                        const suggestion = pickupSuggestions.find((item) => item.line1 === value);
                        if (suggestion && field === 'AddressLine1') applySuggestion('pickup', suggestion);
                      }}
                    />
                    <Field name="destinationAirport" label="Destination airport" error={errors.destinationAirport}>
                      {(props) => (
                        <select
                          {...props}
                          value={booking.destinationAirport}
                          onChange={(event) => {
                            setBooking((current) => ({ ...current, destinationAirport: event.target.value }));
                            setQuote(null);
                          }}
                        >
                          {destinationAirports.map((airport) => (
                            <option key={airport.code} value={airport.code}>{airport.code} — {airport.name}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                  </>
                )}

                <div className="field-grid two-col">
                  <Field name="date" label="Pickup date" error={errors.date}>
                    {(props) => (
                      <input
                        {...props}
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={booking.date}
                        onChange={(event) => {
                          setBooking((current) => ({ ...current, date: event.target.value }));
                          setQuote(null);
                        }}
                      />
                    )}
                  </Field>
                  <Field name="time" label="Pickup time" error={errors.time}>
                    {(props) => (
                      <input
                        {...props}
                        type="time"
                        value={booking.time}
                        onChange={(event) => {
                          setBooking((current) => ({ ...current, time: event.target.value }));
                          setQuote(null);
                        }}
                      />
                    )}
                  </Field>
                </div>
              </>
            )}

            {steps.current === 2 && (
              <>
                <Field name="category" label="Vehicle category" error={errors.category}>
                  {(props) => (
                    <select {...props} value={booking.category} onChange={(event) => updateCategory(event.target.value)}>
                      {fleet.map((item) => (
                        <option key={item.id} value={item.category}>
                          {item.category} — {item.description}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <div className="field-grid two-col">
                  <QuantityField
                    name="passengers"
                    label="Passengers"
                    value={booking.passengers}
                    min={1}
                    max={passengerMax}
                    error={errors.passengers}
                    suggestions={Array.from({ length: passengerMax }, (_, index) => String(index + 1))}
                    onChange={(value) => updateCapacity('passengers', value)}
                  />
                  <QuantityField
                    name="luggage"
                    label="Luggage"
                    value={booking.luggage}
                    min={0}
                    max={luggageMax}
                    error={errors.luggage}
                    suggestions={Array.from({ length: luggageMax + 1 }, (_, index) => String(index))}
                    onChange={(value) => updateCapacity('luggage', value)}
                  />
                </div>
                <p className="booking-capacity">{selectedCategory?.description}. Capacity {passengerMax} passengers · {luggageMax} bags.</p>
              </>
            )}

            {steps.current === 3 && (
              <>
                <div className="field-grid two-col">
                  <Field name="name" label="Lead passenger" error={errors.name}>
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        autoComplete="name"
                        value={booking.name}
                        onChange={(event) => setBooking((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Alex Morgan"
                      />
                    )}
                  </Field>
                  <Field name="phone" label="Mobile number" error={errors.phone}>
                    {(props) => (
                      <input
                        {...props}
                        type="tel"
                        autoComplete="tel"
                        value={booking.phone}
                        onChange={(event) => setBooking((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="+1 212 555 0100"
                      />
                    )}
                  </Field>
                </div>
                <Field name="accountEmail" label="Account email">
                  {(props) => <input {...props} type="email" value={user?.email || ''} readOnly />}
                </Field>
                {!user && <FormBanner message="Sign in before completing passenger details so the reservation is saved to your account." />}
                <Field name="flightNumber" label="Flight number" optional>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={booking.flightNumber}
                      onChange={(event) => setBooking((current) => ({ ...current, flightNumber: event.target.value }))}
                      placeholder="AA188"
                    />
                  )}
                </Field>
                <Field name="notes" label="Special requests" optional>
                  {(props) => (
                    <textarea
                      {...props}
                      rows="3"
                      value={booking.notes}
                      onChange={(event) => setBooking((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Child seat, additional stop, accessibility needs..."
                    />
                  )}
                </Field>
              </>
            )}

            {steps.current === 4 && (
              <>
                <div className="booking-review">
                  <div><span>Journey</span><strong>{booking.transferType === 'from_airport' ? 'From Airport' : 'To Airport'}</strong></div>
                  <div><span>Route</span><strong>{routeSummary}</strong></div>
                  <div><span>Pickup</span><strong>{booking.date} at {booking.time}</strong></div>
                  <div><span>Passenger</span><strong>{booking.name} · {booking.passengers} guests · {booking.luggage} bags</strong></div>
                  <div><span>Vehicle</span><strong>{selectedCategory?.category}</strong></div>
                  <div><span>Flight</span><strong>{booking.flightNumber || 'Not provided'}</strong></div>
                  <div><span>Contact</span><strong>{user?.email} · {booking.phone}</strong></div>
                </div>
                <div className="quote-breakdown" aria-label="Fare breakdown">
                  <div><span>Ride</span><strong>${Number(quote?.base || 0).toFixed(2)}</strong></div>
                  <div><span>Service fee</span><strong>${Number(quote?.serviceFee || 0).toFixed(2)}</strong></div>
                  {Number(quote?.airportSurcharge || 0) > 0 && <div><span>Airport surcharge</span><strong>${Number(quote.airportSurcharge).toFixed(2)}</strong></div>}
                  <div className="quote-total"><span>Total</span><strong>${Number(quote?.total || 0).toFixed(2)}</strong></div>
                </div>
                <p className="booking-capacity">Your request remains pending confirmation until concierge review. Street addresses are service-area validated, not treated as fully geocoded verification.</p>
              </>
            )}

            <FormBanner message={errors.form} />
            <div className="booking-actions">
              {steps.current > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    clearErrors();
                    setSteps((current) => ({ ...current, current: current.current - 1 }));
                  }}
                >
                  Back
                </button>
              )}
              {steps.current < 4 ? (
                <button type="button" className="btn btn-primary" disabled={isQuoting} onClick={handleContinue}>
                  {isQuoting ? 'Preparing quote…' : 'Continue'}
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || !user}>
                  {isSubmitting ? 'Submitting…' : 'Request reservation'}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="success-box">
            <span className="eyebrow">Reservation received</span>
            <h3>Thank you, {reservation?.customer_name || booking.name}.</h3>
            <p className="panel-copy">Your request is awaiting concierge confirmation.</p>
            <div className="booking-review">
              <div><span>Reference</span><strong>{shortReference(reservation?.id)}</strong></div>
              <div><span>Status</span><strong><span className={`status-pill status-${reservation?.status || 'pending_confirmation'}`}>{formatStatus(reservation?.status || 'pending_confirmation')}</span></strong></div>
              <div><span>Route</span><strong>{reservation?.pickup} → {reservation?.destination}</strong></div>
              <div><span>Pickup</span><strong>{reservation?.date} at {reservation?.time}</strong></div>
              <div><span>Vehicle</span><strong>{reservation?.category}</strong></div>
              <div><span>Quoted total</span><strong>${Number(reservation?.total || reservation?.quote_total || 0).toFixed(2)}</strong></div>
            </div>
            <div className="booking-actions">
              <Link to="/dashboard" className="btn btn-primary">View dashboard</Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSubmitted(false);
                  setReservation(null);
                  setQuote(null);
                  setBooking({ ...defaultBooking, date: tomorrowDate(), time: '18:00' });
                  setSteps({ current: 1, total: 4 });
                }}
              >
                Book another transfer
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="booking-side-panel">
        <div className="side-card primary">
          <span className="eyebrow light">Service details</span>
          <h3>Airport transfer chauffeur service</h3>
          <ul>
            <li>From Airport: NJ airport to a street address</li>
            <li>To Airport: street address to an approved airport</li>
            <li>Server-quoted pricing before you submit</li>
          </ul>
        </div>
        <div className="side-card">
          <span className="eyebrow">Fleet highlight</span>
          <h3>{selectedCategory?.category}</h3>
          <p>{selectedCategory?.description}</p>
          <div className="mini-specs">
            <span>{selectedCategory?.seats} passengers</span>
            <span>{selectedCategory?.luggage} luggage</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
