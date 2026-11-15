import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import BookingPage from './BookingPage.jsx';
import {
  Field,
  FleetCard,
  FormBanner,
  formatRoute,
  formatStatus,
  isBannedVehicleModel,
  isValidEmail,
  shortReference,
  useFormErrors,
} from './forms.jsx';

const airportOptions = [
  { code: 'EWR', name: 'Newark Liberty International Airport', state: 'NJ' },
  { code: 'TEB', name: 'Teterboro Airport', state: 'NJ' },
  { code: 'ACY', name: 'Atlantic City International Airport', state: 'NJ' },
  { code: 'TTN', name: 'Trenton–Mercer Airport', state: 'NJ' },
  { code: 'JFK', name: 'John F. Kennedy International Airport', state: 'NY' },
  { code: 'LGA', name: 'LaGuardia Airport', state: 'NY' },
  { code: 'PHL', name: 'Philadelphia International Airport', state: 'PA' },
  { code: 'ABE', name: 'Lehigh Valley International Airport', state: 'PA' },
  { code: 'PIT', name: 'Pittsburgh International Airport', state: 'PA' },
];

function App() {
  const [fleet, setFleet] = useState([]);
  const [airports, setAirports] = useState(airportOptions);
  const [reservations, setReservations] = useState([]);
  const [reservationsState, setReservationsState] = useState('idle');
  const [metrics, setMetrics] = useState(null);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const authErrors = useFormErrors();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAirports();
    fetchFleet();
    fetch('/api/me', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    fetchReservations(user);
    fetchMetrics(user);
  }, [user]);

  const fetchAirports = async () => {
    const response = await fetch('/api/airports');
    const data = await response.json();
    setAirports(data);
  };

  const fetchFleet = async () => {
    const response = await fetch('/api/fleet');
    const data = await response.json();
    setFleet(data);
  };

  const fetchReservations = async (currentUser) => {
    if (!currentUser) {
      setReservations([]);
      setReservationsState('idle');
      return;
    }
    setReservationsState('loading');
    try {
      const endpoint = currentUser.role === 'admin' ? '/api/admin/reservations' : '/api/my-reservations';
      const response = await fetch(endpoint, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load reservations.');
      setReservations(data);
      setReservationsState('ready');
    } catch (error) {
      setReservations([]);
      setReservationsState('error');
    }
  };

  const fetchMetrics = async (currentUser) => {
    if (currentUser?.role !== 'admin') {
      setMetrics(null);
      return;
    }
    const response = await fetch('/api/admin/overview', { credentials: 'include' });
    const data = await response.json();
    setMetrics(response.ok ? data : null);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (authMode === 'register' && !authForm.name.trim()) nextErrors.name = 'Enter your full name.';
    if (!authForm.email.trim()) nextErrors.email = 'Enter your email address.';
    else if (!isValidEmail(authForm.email)) nextErrors.email = 'Enter a valid email address.';
    if (!authForm.password) nextErrors.password = authMode === 'login' ? 'Enter your password.' : 'Create a password.';
    else if (authMode === 'register' && authForm.password.length < 8) {
      nextErrors.password = 'Use at least 8 characters for your password.';
    }
    if (!authErrors.applyErrors(nextErrors, ['name', 'email', 'password'])) return;

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login'
      ? { email: authForm.email, password: authForm.password }
      : authForm;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        authErrors.applyApiErrors(data, 'Authentication failed.');
        return;
      }
      authErrors.clearErrors();
      setUser(data.user);
      if (data.user.role === 'admin') navigate('/admin');
      else if (data.user.role === 'partner') navigate('/partner');
      else if (data.user.role === 'chauffeur') navigate('/chauffeur');
      else navigate('/dashboard');
    } catch {
      authErrors.applyApiErrors({ message: 'Unable to reach Aurelia right now. Please try again.' });
    }
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setReservations([]);
  };

  return (
    <div className="app-shell">
      <Header user={user} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<HomePage fleet={fleet} airports={airports} />} />
        <Route path="/fleet" element={<FleetPage fleet={fleet} />} />
        <Route path="/booking" element={<BookingPage airports={airports} fleet={fleet} user={user} onBookingSuccess={() => fetchReservations(user)} />} />
        <Route path="/login" element={<AuthPage authMode={authMode} setAuthMode={(mode) => { setAuthMode(mode); authErrors.clearErrors(); }} authForm={authForm} setAuthForm={setAuthForm} errors={authErrors.errors} onFieldChange={(field, value) => {
          setAuthForm((current) => ({ ...current, [field]: value }));
          if (field === 'name') authErrors.revalidateField('name', value, (next) => (!String(next).trim() ? 'Enter your full name.' : ''));
          if (field === 'email') authErrors.revalidateField('email', value, (next) => (!String(next).trim() ? 'Enter your email address.' : (!isValidEmail(next) ? 'Enter a valid email address.' : '')));
          if (field === 'password') authErrors.revalidateField('password', value, (next) => (!next ? (authMode === 'login' ? 'Enter your password.' : 'Create a password.') : (authMode === 'register' && next.length < 8 ? 'Use at least 8 characters for your password.' : '')));
        }} onSubmit={handleAuthSubmit} />} />
        <Route path="/dashboard" element={<CustomerDashboardPage user={user} reservations={reservations} reservationsState={reservationsState} onRetry={() => fetchReservations(user)} />} />
        <Route path="/admin" element={<AdminPage metrics={metrics} reservations={reservations} user={user} onMetricsRefresh={() => fetchMetrics(user)} onAssignment={async () => { await fetchReservations(user); await fetchMetrics(user); }} />} />
        <Route path="/partner" element={<PartnerPage user={user} />} />
        <Route path="/partner/join" element={<PartnerJoinPage onJoined={setUser} />} />
        <Route path="/chauffeur" element={<ChauffeurPage user={user} />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Footer />
    </div>
  );
}

function Header({ user, onLogout }) {
  const navItems = [
    { to: '/', label: 'Home' },
    { to: '/fleet', label: 'Fleet' },
    { to: '/booking', label: 'Booking' },
    { to: '/contact', label: 'Contact' },
  ];
  if (user?.role === 'admin') navItems.push({ to: '/admin', label: 'Admin' });
  if (user?.role === 'partner') navItems.push({ to: '/partner', label: 'Partner' });
  if (user?.role === 'chauffeur') navItems.push({ to: '/chauffeur', label: 'Chauffeur' });

  return (
    <header className="topbar">
      <div className="brand-wrap">
        <div className="brand-mark">A</div>
        <div>
          <div className="brand-name">Aurelia</div>
          <div className="brand-tag">Chauffeur</div>
        </div>
      </div>

      <nav className="nav">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="nav-actions">
        {user ? (
          <>
            <Link to="/dashboard" className="nav-button muted">{user.name}</Link>
            <button type="button" className="nav-button primary" onClick={onLogout}>Logout</button>
          </>
        ) : (
          <Link to="/login" className="nav-button primary">Login</Link>
        )}
      </div>
    </header>
  );
}

function HomePage({ fleet, airports }) {
  const featuredAirport = airports.find((airport) => airport.code === 'EWR') || airports[0];
  const featuredVehicle = fleet.find((item) => item.category === 'First Class') || fleet[0];

  return (
    <main>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">Private airport transport</span>
          <h1>Arrive Beyond Expectations.</h1>
          <p>
            Exceptional vehicles. Professional chauffeurs. A journey defined by comfort, privacy,
            and distinction for every airport transfer across New Jersey and the Northeast.
          </p>
          <div className="hero-actions">
            <Link to="/booking" className="btn btn-primary">Book a chauffeur</Link>
            <Link to="/fleet" className="btn btn-secondary">View fleet</Link>
          </div>
        </div>

        <div className="hero-panel">
          <div className="mini-tag">Airport transfers</div>
          <div className="route-box">
            <div>
              <span>Pickup</span>
              <strong>{featuredAirport?.code || 'EWR'}</strong>
            </div>
            <div className="route-arrow">→</div>
            <div>
              <span>Destination</span>
              <strong>JFK</strong>
            </div>
          </div>
          <div className="trip-summary">
            <div>
              <span>From</span>
              <strong>${featuredVehicle?.price || 310}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>{featuredVehicle?.category || 'First Class'}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-head">
          <span className="eyebrow">The luxury experience</span>
          <h2>Private travel tailored to your schedule.</h2>
        </div>
        <div className="info-grid">
          <div className="info-card">
            <h3>Airport transfers</h3>
            <p>Seamless arrival and departure coordination with punctuality, discretion, and airport-specific assistance.</p>
          </div>
          <div className="info-card">
            <h3>Executive travel</h3>
            <p>Quiet, thoughtful service built for board meetings, client arrivals, and polished business schedules.</p>
          </div>
          <div className="info-card">
            <h3>Private aviation</h3>
            <p>Tailored FBO pickup and arrival experiences designed around your itinerary and comfort preferences.</p>
          </div>
        </div>
      </section>

      <section className="fleet-showcase">
        <div className="section-head">
          <span className="eyebrow">Our exclusive fleet</span>
          <h2>Three refined vehicle categories.</h2>
          <p className="panel-copy">Executive sedan, flagship luxury, and commanding SUV — each with a distinct presence.</p>
        </div>
        <div className="fleet-grid">
          {fleet.map((vehicle) => (
            <FleetCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      </section>

      <section className="process-section">
        <div className="section-head center">
          <span className="eyebrow">How reservations work</span>
          <h2>Effortless from request to arrival.</h2>
        </div>
        <div className="steps-grid">
          {['Choose your journey', 'Select vehicle', 'Confirm details', 'Travel in comfort'].map((step, index) => (
            <div className="step-box" key={step}>
              <span>0{index + 1}</span>
              <h3>{step}</h3>
              <p>Professional coordination and polished service, tailored to your route and preferences.</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function FleetPage({ fleet }) {
  return (
    <main className="page-shell">
      <div className="section-head">
        <span className="eyebrow">Fleet overview</span>
        <h2>Premium categories for every type of client journey.</h2>
        <p className="panel-copy">Business Class leads with executive presence, First Class is the flagship sedan, and Luxury SUV delivers spacious prestige.</p>
      </div>
      <div className="fleet-list">
        {fleet.map((vehicle) => (
          <FleetCard key={vehicle.id} vehicle={vehicle} layout="row" />
        ))}
      </div>
    </main>
  );
}

function ReservationCard({ reservation }) {
  return (
    <article className="reservation-card">
      <div className="reservation-card-top">
        <div>
          <span className="eyebrow">Reference {shortReference(reservation.id)}</span>
          <h3>{reservation.category}</h3>
        </div>
        <span className={`status-pill status-${reservation.status}`}>{formatStatus(reservation.status)}</span>
      </div>
      <div className="reservation-card-grid">
        <div><span>Route</span><strong>{formatRoute(reservation)}</strong></div>
        {reservation.transferType && <div><span>Journey</span><strong>{reservation.transferType === 'from_airport' ? 'From Airport' : 'To Airport'}</strong></div>}
        <div><span>Pickup</span><strong>{reservation.date} at {reservation.time}</strong></div>
        <div><span>Flight</span><strong>{reservation.flight_number || 'Not provided'}</strong></div>
        <div><span>Quoted total</span><strong>${Number(reservation.total || reservation.quote_total || 0).toFixed(2)}</strong></div>
      </div>
    </article>
  );
}

function CustomerDashboardPage({ user, reservations, reservationsState, onRetry }) {
  if (!user || user.role !== 'customer') {
    return (
      <main className="page-shell small-shell">
        <div className="card-panel">
          <h2>Customer sign-in required</h2>
          <p>Sign in to review your reservations and travel preferences.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </main>
    );
  }

  const now = Date.now();
  const upcoming = reservations.filter((reservation) => {
    if (['completed', 'cancelled'].includes(reservation.status)) return false;
    const pickupAt = new Date(`${reservation.date}T${reservation.time || '00:00'}`);
    return Number.isNaN(pickupAt.getTime()) || pickupAt.getTime() >= now - 60 * 60 * 1000;
  });
  const past = reservations.filter((reservation) => !upcoming.includes(reservation));

  return (
    <main className="page-shell dashboard-shell">
      <section className="dashboard-welcome">
        <div className="section-head left">
          <span className="eyebrow">Customer portal</span>
          <h2>Welcome back, {user.name.split(' ')[0]}.</h2>
          <p className="panel-copy">Your airport transfers, confirmation status, and reservation references appear here from your live account.</p>
        </div>
        <Link to="/booking" className="btn btn-primary">Book a transfer</Link>
      </section>

      {reservationsState === 'loading' && <p className="panel-copy">Loading your reservations…</p>}
      {reservationsState === 'error' && (
        <div className="card-panel">
          <p role="alert">We could not load your reservations.</p>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>
        </div>
      )}

      {reservationsState === 'ready' && (
        <div className="dashboard-stack">
          <section className="card-panel big-panel">
            <h3>Upcoming reservations</h3>
            {upcoming.length === 0 ? (
              <div className="empty-state">
                <p>No upcoming transfers yet.</p>
                <Link to="/booking" className="btn btn-secondary small">Reserve your next journey</Link>
              </div>
            ) : upcoming.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} />
            ))}
          </section>

          <section className="card-panel big-panel">
            <h3>Past reservations</h3>
            {past.length === 0 ? (
              <div className="empty-state">
                <p>Past journeys will appear here after completion.</p>
              </div>
            ) : past.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} />
            ))}
          </section>
        </div>
      )}
    </main>
  );
}

function AdminPage({ metrics, reservations, user, onAssignment, onMetricsRefresh }) {
  const [chauffeurs, setChauffeurs] = useState([]);
  const [partners, setPartners] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [selectedChauffeurs, setSelectedChauffeurs] = useState({});
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const [partnerNotice, setPartnerNotice] = useState('');
  const [inviteForm, setInviteForm] = useState({ companyName: '', contactEmail: '' });
  const [latestInviteLink, setLatestInviteLink] = useState('');
  const inviteErrors = useFormErrors();

  const refreshOperationalData = async () => {
    const [chauffeurResponse, partnerResponse, vehicleResponse, invitationResponse] = await Promise.all([
      fetch('/api/admin/chauffeurs', { credentials: 'include' }),
      fetch('/api/admin/partners', { credentials: 'include' }),
      fetch('/api/admin/vehicles', { credentials: 'include' }),
      fetch('/api/admin/partner-invitations', { credentials: 'include' }),
    ]);
    const [chauffeurData, partnerData, vehicleData, invitationData] = await Promise.all([
      chauffeurResponse.json(),
      partnerResponse.json(),
      vehicleResponse.json(),
      invitationResponse.json(),
    ]);
    if (!chauffeurResponse.ok) throw new Error(chauffeurData.message || 'Unable to load chauffeurs.');
    if (!partnerResponse.ok) throw new Error(partnerData.message || 'Unable to load partners.');
    if (!vehicleResponse.ok) throw new Error(vehicleData.message || 'Unable to load vehicles.');
    if (!invitationResponse.ok) throw new Error(invitationData.message || 'Unable to load invitations.');
    setChauffeurs(chauffeurData);
    setPartners(partnerData);
    setVehicles(vehicleData);
    setInvitations(invitationData);
  };

  useEffect(() => {
    if (user?.role !== 'admin') {
      setChauffeurs([]);
      setPartners([]);
      setVehicles([]);
      setInvitations([]);
      return;
    }
    refreshOperationalData().catch((error) => setPartnerNotice(error.message));
  }, [user]);

  const assignChauffeur = async (reservationId) => {
    const chauffeurId = selectedChauffeurs[reservationId];
    if (!chauffeurId) return;

    const response = await fetch('/api/admin/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reservationId, chauffeurId }),
    });
    const data = await response.json();
    setAssignmentNotice(response.ok ? data.message : data.message || 'Assignment failed.');
    if (response.ok) {
      setSelectedChauffeurs((current) => ({ ...current, [reservationId]: '' }));
      await Promise.all([onAssignment(), refreshOperationalData()]);
    }
  };

  const invitePartner = async (event) => {
    event.preventDefault();
    setPartnerNotice('');
    setLatestInviteLink('');
    const nextErrors = {};
    if (!inviteForm.companyName.trim()) nextErrors.companyName = 'Enter the transportation company name.';
    if (!inviteForm.contactEmail.trim()) nextErrors.contactEmail = 'Enter the partner contact email.';
    else if (!isValidEmail(inviteForm.contactEmail)) nextErrors.contactEmail = 'Enter a valid contact email.';
    if (!inviteErrors.applyErrors(nextErrors, ['companyName', 'contactEmail'])) return;

    const response = await fetch('/api/admin/partners/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(inviteForm),
    });
    const data = await response.json();
    if (!response.ok) {
      inviteErrors.applyApiErrors(data, 'Unable to create invitation.');
      return;
    }
    inviteErrors.clearErrors();
    setPartnerNotice(data.message);
    setLatestInviteLink(data.invitation?.invitePath || '');
    setInviteForm({ companyName: '', contactEmail: '' });
    await Promise.all([refreshOperationalData(), onMetricsRefresh?.()]);
  };

  const updatePartnerStatus = async (partnerId, status) => {
    const response = await fetch(`/api/admin/partners/${partnerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    setPartnerNotice(response.ok ? data.message : data.message || 'Unable to update partner.');
    if (response.ok) {
      await Promise.all([refreshOperationalData(), onMetricsRefresh?.()]);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <main className="page-shell small-shell">
        <div className="card-panel">
          <h2>Administrator access required</h2>
          <p>Sign in with an administrator account to open dispatch operations.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell admin-shell">
      <div className="section-head left">
        <span className="eyebrow">Operations dashboard</span>
        <h2>Dispatch, partners, and fleet control.</h2>
      </div>

      <div className="stats-grid admin-stats-grid">
        <div className="stat-card"><span>Reservations</span><strong>{metrics?.reservationsToday || 0}</strong></div>
        <div className="stat-card"><span>Active trips</span><strong>{metrics?.activeTrips || 0}</strong></div>
        <div className="stat-card"><span>Pending rides</span><strong>{metrics?.pendingApprovals || 0}</strong></div>
        <div className="stat-card"><span>Available vehicles</span><strong>{metrics?.availableVehicles || 0}</strong></div>
        <div className="stat-card"><span>Active partners</span><strong>{metrics?.activePartners || 0}</strong></div>
        <div className="stat-card"><span>Pending partners</span><strong>{metrics?.pendingPartners || 0}</strong></div>
        <div className="stat-card"><span>Revenue</span><strong>${metrics?.revenue || 0}</strong></div>
      </div>

      <div className="card-panel big-panel">
        <h3>Reservation board</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Route</th>
                <th>Category</th>
                <th>Status</th>
                <th>Chauffeur</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td>{reservation.customer}</td>
                  <td>{formatRoute(reservation)}</td>
                  <td>{reservation.category}</td>
                  <td><span className={`status-pill status-${reservation.status}`}>{reservation.status.replaceAll('_', ' ')}</span></td>
                  <td>
                    {reservation.chauffeur_name ? (
                      <span>{reservation.chauffeur_name}</span>
                    ) : (
                      <div className="assignment-control">
                        <select
                          aria-label={`Chauffeur for reservation ${reservation.id}`}
                          value={selectedChauffeurs[reservation.id] || ''}
                          onChange={(event) => setSelectedChauffeurs((current) => ({ ...current, [reservation.id]: event.target.value }))}
                        >
                          <option value="">Select chauffeur</option>
                          {chauffeurs.filter((chauffeur) => chauffeur.status === 'available').map((chauffeur) => (
                            <option key={chauffeur.id} value={chauffeur.id}>
                              {chauffeur.full_name}{chauffeur.partner_name ? ` · ${chauffeur.partner_name}` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-secondary small"
                          disabled={!selectedChauffeurs[reservation.id]}
                          onClick={() => assignChauffeur(reservation.id)}
                        >
                          Assign
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {assignmentNotice && <p role="status">{assignmentNotice}</p>}
      </div>

      <div className="ops-grid">
        <div className="card-panel big-panel">
          <h3>Invite transportation partner</h3>
          <p className="panel-copy">Invitations are admin-only, single-use, and expire after seven days. There is no public partner registration.</p>
          <form className="ops-form" onSubmit={invitePartner} noValidate>
            <Field name="companyName" label="Company name" error={inviteErrors.errors.companyName}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={inviteForm.companyName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setInviteForm((current) => ({ ...current, companyName: value }));
                    inviteErrors.revalidateField('companyName', value, (next) => (!String(next).trim() ? 'Enter the transportation company name.' : ''));
                  }}
                />
              )}
            </Field>
            <Field name="contactEmail" label="Contact email" error={inviteErrors.errors.contactEmail}>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  value={inviteForm.contactEmail}
                  onChange={(event) => {
                    const value = event.target.value;
                    setInviteForm((current) => ({ ...current, contactEmail: value }));
                    inviteErrors.revalidateField('contactEmail', value, (next) => (!String(next).trim() ? 'Enter the partner contact email.' : (!isValidEmail(next) ? 'Enter a valid contact email.' : '')));
                  }}
                />
              )}
            </Field>
            <FormBanner message={inviteErrors.errors.form} />
            <button type="submit" className="btn btn-primary">Create invitation</button>
          </form>
          {latestInviteLink && (
            <p className="invite-link" role="status">
              Share this secure link: <code>{latestInviteLink}</code>
            </p>
          )}
          {partnerNotice && <p role="status">{partnerNotice}</p>}
        </div>

        <div className="card-panel big-panel">
          <h3>Recent invitations</h3>
          {invitations.length === 0 ? <p>No invitations have been issued.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Company</th><th>Email</th><th>Status</th><th>Expires</th></tr></thead>
                <tbody>
                  {invitations.slice(0, 8).map((invitation) => (
                    <tr key={invitation.id}>
                      <td>{invitation.companyName}</td>
                      <td>{invitation.contactEmail}</td>
                      <td><span className={`status-pill status-${invitation.status}`}>{invitation.status}</span></td>
                      <td>{new Date(invitation.expiresAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card-panel big-panel">
        <h3>Partner roster</h3>
        {partners.length === 0 ? <p>No partners are on record yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Fleet</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => (
                  <tr key={partner.id}>
                    <td>{partner.companyName}</td>
                    <td>{partner.ownerEmail || partner.contactEmail || '—'}</td>
                    <td><span className={`status-pill status-${partner.status}`}>{partner.status}</span></td>
                    <td>{partner.chauffeurCount} chauffeurs · {partner.vehicleCount} vehicles</td>
                    <td>
                      <div className="action-row">
                        {partner.status !== 'active' && (
                          <button type="button" className="btn btn-secondary small" onClick={() => updatePartnerStatus(partner.id, 'active')}>Activate</button>
                        )}
                        {partner.status === 'invited' && (
                          <button type="button" className="btn btn-secondary small" onClick={() => updatePartnerStatus(partner.id, 'approved')}>Mark approved</button>
                        )}
                        {partner.status !== 'suspended' && (
                          <button type="button" className="btn btn-secondary small" onClick={() => updatePartnerStatus(partner.id, 'suspended')}>Suspend</button>
                        )}
                        {partner.status === 'suspended' && (
                          <button type="button" className="btn btn-secondary small" onClick={() => updatePartnerStatus(partner.id, 'approved')}>Reinstate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-panel big-panel">
        <h3>Network fleet inventory</h3>
        {vehicles.length === 0 ? <p>No partner vehicles have been registered.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Category</th>
                  <th>Vehicle</th>
                  <th>Plate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>{vehicle.partnerName}</td>
                    <td>{vehicle.category}</td>
                    <td>{vehicle.makeModel}{vehicle.year ? ` · ${vehicle.year}` : ''}</td>
                    <td>{vehicle.licensePlate}</td>
                    <td><span className={`status-pill status-${vehicle.status}`}>{vehicle.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function PartnerJoinPage({ onJoined }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [invitation, setInvitation] = useState(null);
  const [form, setForm] = useState({ name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(token));
  const joinErrors = useFormErrors();

  useEffect(() => {
    if (!token) {
      setError('Invitation token is missing.');
      setLoading(false);
      return;
    }
    fetch(`/api/partner/invitations/${token}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Invitation is not valid.');
        setInvitation(data.invitation);
        setLoading(false);
      })
      .catch((requestError) => {
        setError(requestError.message);
        setLoading(false);
      });
  }, [token]);

  const acceptInvitation = async (event) => {
    event.preventDefault();
    setError('');
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Enter your full name.';
    if (!form.password) nextErrors.password = 'Create a password.';
    else if (form.password.length < 8) nextErrors.password = 'Use at least 8 characters for your password.';
    if (!joinErrors.applyErrors(nextErrors, ['name', 'password'])) return;

    const response = await fetch('/api/partner/accept-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, name: form.name, password: form.password }),
    });
    const data = await response.json();
    if (!response.ok) {
      joinErrors.applyApiErrors(data, 'Unable to create partner account.');
      return;
    }
    joinErrors.clearErrors();
    onJoined(data.user);
    navigate('/partner');
  };

  return (
    <main className="page-shell auth-shell">
      <div className="card-panel auth-card">
        <span className="eyebrow">Partner invitation</span>
        <h2>Create your transportation company account.</h2>
        {loading && <p>Validating invitation…</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && invitation && (
          <>
            <p className="panel-copy">
              You are joining <strong>{invitation.companyName}</strong> with {invitation.contactEmail}.
              Public partner registration is not available.
            </p>
            <form className="auth-form" onSubmit={acceptInvitation} noValidate>
              <Field name="name" label="Your name" error={joinErrors.errors.name}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={form.name}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((current) => ({ ...current, name: value }));
                      joinErrors.revalidateField('name', value, (next) => (!String(next).trim() ? 'Enter your full name.' : ''));
                    }}
                  />
                )}
              </Field>
              <Field name="password" label="Password" error={joinErrors.errors.password}>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    value={form.password}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((current) => ({ ...current, password: value }));
                      joinErrors.revalidateField('password', value, (next) => (!next ? 'Create a password.' : (next.length < 8 ? 'Use at least 8 characters for your password.' : '')));
                    }}
                  />
                )}
              </Field>
              <FormBanner message={joinErrors.errors.form} />
              <button type="submit" className="btn btn-primary">Activate partner account</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function PartnerPage({ user }) {
  const [profile, setProfile] = useState(null);
  const [trips, setTrips] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [profileForm, setProfileForm] = useState({ companyName: '', phone: '', address: '', notes: '' });
  const [chauffeurForm, setChauffeurForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [vehicleForm, setVehicleForm] = useState({
    categorySlug: 'business-class',
    makeModel: 'Mercedes E-Class',
    licensePlate: '',
    color: '',
    year: '',
    seats: 4,
    luggage: 3,
  });
  const profileErrors = useFormErrors();
  const chauffeurErrors = useFormErrors();
  const vehicleErrors = useFormErrors();

  const categoryDefaults = {
    'business-class': { makeModel: 'Mercedes E-Class', seats: 4, luggage: 3 },
    'first-class': { makeModel: 'Mercedes S-Class', seats: 4, luggage: 3 },
    'luxury-suv': { makeModel: 'Cadillac Escalade', seats: 6, luggage: 5 },
  };

  const refreshPartnerData = async () => {
    const [profileResponse, tripsResponse, chauffeurResponse, vehicleResponse] = await Promise.all([
      fetch('/api/partner/profile', { credentials: 'include' }),
      fetch('/api/partner/trips', { credentials: 'include' }),
      fetch('/api/partner/chauffeurs', { credentials: 'include' }),
      fetch('/api/partner/vehicles', { credentials: 'include' }),
    ]);
    const [profileData, tripsData, chauffeurData, vehicleData] = await Promise.all([
      profileResponse.json(),
      tripsResponse.json(),
      chauffeurResponse.json(),
      vehicleResponse.json(),
    ]);
    if (!profileResponse.ok) throw new Error(profileData.message || 'Unable to load partner profile.');
    if (!tripsResponse.ok) throw new Error(tripsData.message || 'Unable to load partner trips.');
    if (!chauffeurResponse.ok) throw new Error(chauffeurData.message || 'Unable to load chauffeurs.');
    if (!vehicleResponse.ok) throw new Error(vehicleData.message || 'Unable to load vehicles.');
    setProfile(profileData.partner);
    setProfileForm({
      companyName: profileData.partner.companyName || '',
      phone: profileData.partner.phone || '',
      address: profileData.partner.address || '',
      notes: profileData.partner.notes || '',
    });
    setTrips(tripsData);
    setChauffeurs(chauffeurData);
    setVehicles(vehicleData);
  };

  useEffect(() => {
    if (user?.role !== 'partner') return;
    refreshPartnerData().catch((requestError) => setError(requestError.message));
  }, [user]);

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!profileForm.companyName.trim()) nextErrors.companyName = 'Enter your company name.';
    if (!profileErrors.applyErrors(nextErrors, ['companyName'])) return;
    const response = await fetch('/api/partner/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(profileForm),
    });
    const data = await response.json();
    if (!response.ok) {
      profileErrors.applyApiErrors(data, 'Unable to update profile.');
      return;
    }
    profileErrors.clearErrors();
    setNotice(data.message);
    setProfile(data.partner);
  };

  const addChauffeur = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!chauffeurForm.fullName.trim()) nextErrors.fullName = 'Enter the chauffeur full name.';
    if (!chauffeurForm.email.trim()) nextErrors.email = 'Enter the chauffeur email.';
    else if (!isValidEmail(chauffeurForm.email)) nextErrors.email = 'Enter a valid email address.';
    if (!chauffeurForm.password) nextErrors.password = 'Create a temporary password.';
    else if (chauffeurForm.password.length < 8) nextErrors.password = 'Use at least 8 characters for the temporary password.';
    if (!chauffeurErrors.applyErrors(nextErrors, ['fullName', 'email', 'password'])) return;

    const response = await fetch('/api/partner/chauffeurs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(chauffeurForm),
    });
    const data = await response.json();
    if (!response.ok) {
      chauffeurErrors.applyApiErrors(data, 'Unable to add chauffeur.');
      return;
    }
    chauffeurErrors.clearErrors();
    setNotice(data.message);
    setChauffeurForm({ fullName: '', email: '', phone: '', password: '' });
    await refreshPartnerData();
  };

  const updateChauffeurStatus = async (chauffeurId, status) => {
    const response = await fetch(`/api/partner/chauffeurs/${chauffeurId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    setNotice(response.ok ? data.message : data.message || 'Unable to update chauffeur.');
    if (response.ok) await refreshPartnerData();
  };

  const addVehicle = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!vehicleForm.makeModel.trim()) nextErrors.makeModel = 'Enter the vehicle make and model.';
    else if (isBannedVehicleModel(vehicleForm.makeModel)) {
      nextErrors.makeModel = 'Infiniti QX80 is not an accepted vehicle model. Use Cadillac Escalade or Similar for Luxury SUV.';
    }
    if (!vehicleForm.licensePlate.trim()) nextErrors.licensePlate = 'Enter the license plate.';
    if (!vehicleErrors.applyErrors(nextErrors, ['makeModel', 'licensePlate'])) return;

    const response = await fetch('/api/partner/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(vehicleForm),
    });
    const data = await response.json();
    if (!response.ok) {
      vehicleErrors.applyApiErrors(data, 'Unable to add vehicle.');
      return;
    }
    vehicleErrors.clearErrors();
    setNotice(data.message);
    const defaults = categoryDefaults[vehicleForm.categorySlug];
    setVehicleForm({
      categorySlug: vehicleForm.categorySlug,
      makeModel: defaults.makeModel,
      licensePlate: '',
      color: '',
      year: '',
      seats: defaults.seats,
      luggage: defaults.luggage,
    });
    await refreshPartnerData();
  };

  const updateVehicleStatus = async (vehicleId, status) => {
    const response = await fetch(`/api/partner/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    setNotice(response.ok ? data.message : data.message || 'Unable to update vehicle.');
    if (response.ok) await refreshPartnerData();
  };

  if (user?.role !== 'partner') {
    return (
      <main className="page-shell small-shell">
        <div className="card-panel">
          <h2>Partner access required</h2>
          <p>Sign in with an invited partner account. Public partner registration is not available.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </main>
    );
  }

  const canManageFleet = profile?.status === 'active';

  return (
    <main className="page-shell admin-shell">
      <div className="section-head left">
        <span className="eyebrow">Partner portal</span>
        <h2>{profile?.companyName || 'Partner operations'}.</h2>
        {profile && <p className="panel-copy">Account status: <span className={`status-pill status-${profile.status}`}>{profile.status}</span></p>}
      </div>

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {profile && profile.status === 'approved' && (
        <p className="panel-copy">Your account is approved. An administrator must activate the company before chauffeurs and vehicles can be managed.</p>
      )}

      <div className="ops-grid">
        <div className="card-panel big-panel">
          <h3>Company profile</h3>
          <form className="ops-form" onSubmit={saveProfile} noValidate>
            <Field name="companyName" label="Company name" error={profileErrors.errors.companyName}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={profileForm.companyName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setProfileForm((current) => ({ ...current, companyName: value }));
                    profileErrors.revalidateField('companyName', value, (next) => (!String(next).trim() ? 'Enter your company name.' : ''));
                  }}
                />
              )}
            </Field>
            <Field name="phone" label="Phone" error={profileErrors.errors.phone}>
              {(props) => <input {...props} type="tel" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} />}
            </Field>
            <Field name="address" label="Address" error={profileErrors.errors.address}>
              {(props) => <input {...props} type="text" value={profileForm.address} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} />}
            </Field>
            <Field name="notes" label="Operations notes" optional error={profileErrors.errors.notes}>
              {(props) => <textarea {...props} rows="3" value={profileForm.notes} onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))} />}
            </Field>
            <FormBanner message={profileErrors.errors.form} />
            <button type="submit" className="btn btn-primary">Save profile</button>
          </form>
        </div>

        <div className="card-panel big-panel">
          <h3>Assigned trips</h3>
          {trips.length === 0 ? <p>No trips have been assigned to your fleet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Route</th><th>Pickup</th><th>Vehicle</th><th>Chauffeur</th><th>Status</th></tr></thead>
                <tbody>{trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>{formatRoute(trip)}</td>
                    <td>{trip.date} at {trip.time}</td>
                    <td>{trip.category}</td>
                    <td>{trip.chauffeur_name}</td>
                    <td><span className={`status-pill status-${trip.status}`}>{trip.status.replaceAll('_', ' ')}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="ops-grid">
        <div className="card-panel big-panel">
          <h3>Chauffeur roster</h3>
          {canManageFleet ? (
            <form className="ops-form" onSubmit={addChauffeur} noValidate>
              <Field name="fullName" label="Full name" error={chauffeurErrors.errors.fullName}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={chauffeurForm.fullName}
                    onChange={(event) => {
                      const value = event.target.value;
                      setChauffeurForm((current) => ({ ...current, fullName: value }));
                      chauffeurErrors.revalidateField('fullName', value, (next) => (!String(next).trim() ? 'Enter the chauffeur full name.' : ''));
                    }}
                  />
                )}
              </Field>
              <Field name="email" label="Email" error={chauffeurErrors.errors.email}>
                {(props) => (
                  <input
                    {...props}
                    type="email"
                    value={chauffeurForm.email}
                    onChange={(event) => {
                      const value = event.target.value;
                      setChauffeurForm((current) => ({ ...current, email: value }));
                      chauffeurErrors.revalidateField('email', value, (next) => (!String(next).trim() ? 'Enter the chauffeur email.' : (!isValidEmail(next) ? 'Enter a valid email address.' : '')));
                    }}
                  />
                )}
              </Field>
              <Field name="phone" label="Phone" optional error={chauffeurErrors.errors.phone}>
                {(props) => <input {...props} type="tel" value={chauffeurForm.phone} onChange={(event) => setChauffeurForm((current) => ({ ...current, phone: event.target.value }))} />}
              </Field>
              <Field name="password" label="Temporary password" error={chauffeurErrors.errors.password}>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    value={chauffeurForm.password}
                    onChange={(event) => {
                      const value = event.target.value;
                      setChauffeurForm((current) => ({ ...current, password: value }));
                      chauffeurErrors.revalidateField('password', value, (next) => (!next ? 'Create a temporary password.' : (next.length < 8 ? 'Use at least 8 characters for the temporary password.' : '')));
                    }}
                  />
                )}
              </Field>
              <FormBanner message={chauffeurErrors.errors.form} />
              <button type="submit" className="btn btn-primary">Add chauffeur</button>
            </form>
          ) : <p className="panel-copy">Fleet management unlocks after administrator activation.</p>}
          {chauffeurs.length === 0 ? <p>No chauffeurs on your roster yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {chauffeurs.map((chauffeur) => (
                    <tr key={chauffeur.id}>
                      <td>{chauffeur.fullName}</td>
                      <td>{chauffeur.email || '—'}</td>
                      <td><span className={`status-pill status-${chauffeur.status}`}>{chauffeur.status}</span></td>
                      <td>
                        {canManageFleet && chauffeur.status !== 'assigned' && (
                          <button
                            type="button"
                            className="btn btn-secondary small"
                            onClick={() => updateChauffeurStatus(chauffeur.id, chauffeur.status === 'offline' ? 'available' : 'offline')}
                          >
                            {chauffeur.status === 'offline' ? 'Set available' : 'Set offline'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card-panel big-panel">
          <h3>Vehicle fleet</h3>
          <p className="panel-copy">Only Business Class, First Class, and Luxury SUV are supported. Infiniti QX80 is not offered.</p>
          {canManageFleet ? (
            <form className="ops-form" onSubmit={addVehicle} noValidate>
              <Field name="categorySlug" label="Category" error={vehicleErrors.errors.categorySlug}>
                {(props) => (
                  <select
                    {...props}
                    value={vehicleForm.categorySlug}
                    onChange={(event) => {
                      const categorySlug = event.target.value;
                      const defaults = categoryDefaults[categorySlug];
                      setVehicleForm((current) => ({
                        ...current,
                        categorySlug,
                        makeModel: defaults.makeModel,
                        seats: defaults.seats,
                        luggage: defaults.luggage,
                      }));
                      vehicleErrors.setFieldError('makeModel', null);
                    }}
                  >
                    <option value="business-class">Business Class — Mercedes E-Class or Similar</option>
                    <option value="first-class">First Class — Mercedes S-Class or Similar</option>
                    <option value="luxury-suv">Luxury SUV — Cadillac Escalade or Similar</option>
                  </select>
                )}
              </Field>
              <Field name="makeModel" label="Make / model" error={vehicleErrors.errors.makeModel}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={vehicleForm.makeModel}
                    onChange={(event) => {
                      const value = event.target.value;
                      setVehicleForm((current) => ({ ...current, makeModel: value }));
                      vehicleErrors.revalidateField('makeModel', value, (next) => {
                        if (!String(next).trim()) return 'Enter the vehicle make and model.';
                        if (isBannedVehicleModel(next)) return 'Infiniti QX80 is not an accepted vehicle model. Use Cadillac Escalade or Similar for Luxury SUV.';
                        return '';
                      });
                    }}
                  />
                )}
              </Field>
              <Field name="licensePlate" label="License plate" error={vehicleErrors.errors.licensePlate}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={vehicleForm.licensePlate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setVehicleForm((current) => ({ ...current, licensePlate: value }));
                      vehicleErrors.revalidateField('licensePlate', value, (next) => (!String(next).trim() ? 'Enter the license plate.' : ''));
                    }}
                  />
                )}
              </Field>
              <Field name="color" label="Color" optional error={vehicleErrors.errors.color}>
                {(props) => <input {...props} type="text" value={vehicleForm.color} onChange={(event) => setVehicleForm((current) => ({ ...current, color: event.target.value }))} />}
              </Field>
              <Field name="year" label="Year" optional error={vehicleErrors.errors.year}>
                {(props) => <input {...props} type="number" min="2000" max="2100" value={vehicleForm.year} onChange={(event) => setVehicleForm((current) => ({ ...current, year: event.target.value }))} />}
              </Field>
              <FormBanner message={vehicleErrors.errors.form} />
              <button type="submit" className="btn btn-primary">Add vehicle</button>
            </form>
          ) : <p className="panel-copy">Vehicle registration unlocks after administrator activation.</p>}
          {vehicles.length === 0 ? <p>No vehicles registered for your company.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Category</th><th>Vehicle</th><th>Plate</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {vehicles.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>{vehicle.category}</td>
                      <td>{vehicle.makeModel}</td>
                      <td>{vehicle.licensePlate}</td>
                      <td><span className={`status-pill status-${vehicle.status}`}>{vehicle.status}</span></td>
                      <td>
                        {canManageFleet && (
                          <div className="action-row">
                            {vehicle.status !== 'available' && (
                              <button type="button" className="btn btn-secondary small" onClick={() => updateVehicleStatus(vehicle.id, 'available')}>Available</button>
                            )}
                            {vehicle.status !== 'maintenance' && (
                              <button type="button" className="btn btn-secondary small" onClick={() => updateVehicleStatus(vehicle.id, 'maintenance')}>Maintenance</button>
                            )}
                            {vehicle.status !== 'inactive' && (
                              <button type="button" className="btn btn-secondary small" onClick={() => updateVehicleStatus(vehicle.id, 'inactive')}>Inactive</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function ChauffeurPage({ user }) {
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState('');

  const refreshTrips = async () => {
    const response = await fetch('/api/chauffeur/trips', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to load assigned trips.');
    setTrips(data);
  };

  useEffect(() => {
    if (user?.role !== 'chauffeur') return;
    refreshTrips().catch((requestError) => setError(requestError.message));
  }, [user]);

  const updateTripStatus = async (trip, status) => {
    const response = await fetch(`/api/chauffeur/trips/${trip.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || 'Unable to update trip status.');
      return;
    }
    setError('');
    await refreshTrips();
  };

  if (user?.role !== 'chauffeur') {
    return (
      <main className="page-shell small-shell">
        <div className="card-panel">
          <h2>Chauffeur sign-in required</h2>
          <p>Sign in with your chauffeur account to view and update assigned trips.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell small-shell">
      <div className="section-head left">
        <span className="eyebrow">Chauffeur portal</span>
        <h2>Route readiness and trip updates.</h2>
      </div>
      <div className="card-panel big-panel">
        <h3>My trips</h3>
        {error && <p role="alert">{error}</p>}
        {trips.length === 0 ? <p>No trips are currently assigned.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Route</th><th>Pickup</th><th>Vehicle</th><th>Flight</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{trips.map((trip) => (
                <tr key={trip.id}>
                  <td>{formatRoute(trip)}</td>
                  <td>{trip.date} at {trip.time}</td>
                  <td>{trip.category}</td>
                  <td>{trip.flight_number || '—'}</td>
                  <td><span className={`status-pill status-${trip.status}`}>{trip.status.replaceAll('_', ' ')}</span></td>
                  <td>
                    {trip.status === 'assigned' && <button type="button" className="btn btn-primary small" onClick={() => updateTripStatus(trip, 'in_transit')}>Start trip</button>}
                    {trip.status === 'in_transit' && <button type="button" className="btn btn-secondary small" onClick={() => updateTripStatus(trip, 'completed')}>Complete</button>}
                    {trip.status === 'completed' && <span>Complete</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function AuthPage({ authMode, setAuthMode, authForm, onFieldChange, errors, onSubmit }) {
  return (
    <main className="page-shell auth-shell">
      <div className="auth-card card-panel">
        <span className="eyebrow">Member access</span>
        <h2>{authMode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2>
        <div className="auth-tabs">
          <button type="button" className={authMode === 'login' ? 'tab active' : 'tab'} onClick={() => setAuthMode('login')}>Login</button>
          <button type="button" className={authMode === 'register' ? 'tab active' : 'tab'} onClick={() => setAuthMode('register')}>Register</button>
        </div>

        <form onSubmit={onSubmit} className="auth-form" noValidate>
          {authMode === 'register' && (
            <Field name="name" label="Full name" error={errors.name}>
              {(props) => (
                <input {...props} type="text" value={authForm.name} onChange={(event) => onFieldChange('name', event.target.value)} placeholder="Alex Morgan" autoComplete="name" />
              )}
            </Field>
          )}

          <Field name="email" label="Email address" error={errors.email}>
            {(props) => (
              <input {...props} type="email" value={authForm.email} onChange={(event) => onFieldChange('email', event.target.value)} placeholder="you@aurelia.com" autoComplete="email" />
            )}
          </Field>

          <Field name="password" label="Password" error={errors.password}>
            {(props) => (
              <input {...props} type="password" value={authForm.password} onChange={(event) => onFieldChange('password', event.target.value)} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
            )}
          </Field>

          <FormBanner message={errors.form} />
          <button type="submit" className="btn btn-primary full-width">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </div>
    </main>
  );
}

function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);
  const { errors, clearErrors, applyErrors, revalidateField } = useFormErrors();

  const onChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'name') revalidateField('name', value, (next) => (!String(next).trim() ? 'Enter your name.' : ''));
    if (field === 'email') revalidateField('email', value, (next) => (!String(next).trim() ? 'Enter your email address.' : (!isValidEmail(next) ? 'Enter a valid email address.' : '')));
    if (field === 'message') revalidateField('message', value, (next) => (!String(next).trim() ? 'Tell us how we can help.' : (String(next).trim().length < 10 ? 'Please include a bit more detail.' : '')));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Enter your name.';
    if (!form.email.trim()) nextErrors.email = 'Enter your email address.';
    else if (!isValidEmail(form.email)) nextErrors.email = 'Enter a valid email address.';
    if (!form.message.trim()) nextErrors.message = 'Tell us how we can help.';
    else if (form.message.trim().length < 10) nextErrors.message = 'Please include a bit more detail.';
    if (!applyErrors(nextErrors, ['name', 'email', 'message'])) return;
    clearErrors();
    setSent(true);
  };

  return (
    <main className="page-shell small-shell">
      <div className="section-head left">
        <span className="eyebrow">Contact</span>
        <h2>Concierge support for every route.</h2>
      </div>
      <div className="contact-layout">
        <div className="contact-panel card-panel">
          <p>Email: concierge@aureliachauffeur.com</p>
          <p>Phone: +1 (212) 555-0188</p>
          <p>Hours: 24/7 for reservation and operational support</p>
        </div>
        <div className="card-panel">
          {sent ? (
            <div className="success-box compact">
              <span className="eyebrow">Message received</span>
              <h3>Thank you, {form.name}.</h3>
              <p>Our concierge team will respond shortly.</p>
            </div>
          ) : (
            <form className="ops-form" onSubmit={onSubmit} noValidate>
              <Field name="name" label="Your name" error={errors.name}>
                {(props) => <input {...props} type="text" value={form.name} onChange={(event) => onChange('name', event.target.value)} />}
              </Field>
              <Field name="email" label="Email" error={errors.email}>
                {(props) => <input {...props} type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} />}
              </Field>
              <Field name="message" label="How can we help?" error={errors.message}>
                {(props) => <textarea {...props} rows="4" value={form.message} onChange={(event) => onChange('message', event.target.value)} />}
              </Field>
              <FormBanner message={errors.form} />
              <button type="submit" className="btn btn-primary">Send message</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="page-shell small-shell">
      <div className="card-panel not-found-box">
        <h2>Page not found</h2>
        <p>The route you requested is unavailable.</p>
        <Link to="/" className="btn btn-primary">Return home</Link>
      </div>
    </main>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div>
        <strong>Aurelia Chauffeur</strong>
        <p>Premium airport and executive transportation.</p>
      </div>
      <div>
        <Link to="/fleet">Fleet</Link>
        <Link to="/booking">Booking</Link>
        <Link to="/contact">Contact</Link>
      </div>
    </footer>
  );
}

export default App;
