import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';

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

const defaultBooking = {
  name: '',
  email: '',
  phone: '',
  pickup: 'EWR',
  destination: 'JFK',
  date: '2026-12-16',
  time: '18:00',
  flightNumber: 'AA188',
  passengers: 2,
  luggage: 2,
  notes: '',
  category: 'Business Class',
};

function App() {
  const [fleet, setFleet] = useState([]);
  const [airports, setAirports] = useState(airportOptions);
  const [reservations, setReservations] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: 'customer@aurelia.com', password: 'demo123' });

  useEffect(() => {
    fetchAirports();
    fetchFleet();
    fetchReservations();
    fetchMetrics();
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('aurelia-user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

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

  const fetchReservations = async () => {
    const response = await fetch('/api/reservations');
    const data = await response.json();
    setReservations(data);
  };

  const fetchMetrics = async () => {
    const response = await fetch('/api/admin/overview');
    const data = await response.json();
    setMetrics(data);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login'
      ? { email: authForm.email, password: authForm.password }
      : authForm;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      alert(data.message || 'Authentication failed.');
      return;
    }

    setUser(data.user);
    localStorage.setItem('aurelia-user', JSON.stringify(data.user));
  };

  return (
    <div className="app-shell">
      <Header user={user} onLogout={() => { setUser(null); localStorage.removeItem('aurelia-user'); }} />
      <Routes>
        <Route path="/" element={<HomePage fleet={fleet} airports={airports} />} />
        <Route path="/fleet" element={<FleetPage fleet={fleet} />} />
        <Route path="/booking" element={<BookingPage airports={airports} fleet={fleet} onBookingSuccess={fetchReservations} />} />
        <Route path="/login" element={<AuthPage authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} onSubmit={handleAuthSubmit} />} />
        <Route path="/dashboard" element={<CustomerDashboardPage user={user} reservations={reservations} />} />
        <Route path="/admin" element={<AdminPage metrics={metrics} reservations={reservations} />} />
        <Route path="/partner" element={<PartnerPage />} />
        <Route path="/chauffeur" element={<ChauffeurPage />} />
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
    { to: '/admin', label: 'Admin' },
    { to: '/partner', label: 'Partner' },
    { to: '/chauffeur', label: 'Chauffeur' },
    { to: '/contact', label: 'Contact' },
  ];

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
          <div className="hero-metrics">
            <div><strong>24/7</strong><span>concierge support</span></div>
            <div><strong>4.9/5</strong><span>guest rating</span></div>
            <div><strong>15k+</strong><span>rides served</span></div>
          </div>
        </div>

        <div className="hero-panel">
          <div className="mini-tag">Now booking</div>
          <div className="route-box">
            <div>
              <span>Pickup</span>
              <strong>{featuredAirport?.code}</strong>
            </div>
            <div className="route-arrow">→</div>
            <div>
              <span>Destination</span>
              <strong>{featuredVehicle ? 'JFK' : 'NYC'}</strong>
            </div>
          </div>
          <div className="trip-summary">
            <div>
              <span>Estimated</span>
              <strong>${featuredVehicle?.price || 310}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>42 mins</strong>
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
        </div>
        <div className="fleet-grid">
          {fleet.map((vehicle) => (
            <article key={vehicle.id} className="fleet-card">
              <img src={vehicle.image} alt={vehicle.name} />
              <div className="fleet-card-body">
                <div className="fleet-head">
                  <div>
                    <h3>{vehicle.name}</h3>
                    <span>{vehicle.description}</span>
                  </div>
                  <strong>${vehicle.price}</strong>
                </div>
                <ul>
                  <li>{vehicle.seats} passengers</li>
                  <li>{vehicle.luggage} luggage</li>
                  <li>{vehicle.amenities[0]}</li>
                </ul>
              </div>
            </article>
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
      </div>
      <div className="fleet-list">
        {fleet.map((vehicle) => (
          <div className="fleet-row" key={vehicle.id}>
            <img src={vehicle.image} alt={vehicle.name} />
            <div className="fleet-row-body">
              <div className="fleet-head">
                <div>
                  <h3>{vehicle.name}</h3>
                  <span>{vehicle.description}</span>
                </div>
                <strong>${vehicle.price}</strong>
              </div>
              <p>Refined travel experience designed for airport arrivals, executive movements, and premium everyday comfort.</p>
              <div className="spec-row">
                <span>{vehicle.seats} passengers</span>
                <span>{vehicle.luggage} luggage</span>
                <span>{vehicle.amenities.join(' • ')}</span>
              </div>
              <Link to="/booking" className="btn btn-primary small">Reserve this category</Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function BookingPage({ airports, fleet, onBookingSuccess }) {
  const [booking, setBooking] = useState(defaultBooking);
  const [steps, setSteps] = useState({ current: 1, total: 4 });
  const [submitted, setSubmitted] = useState(false);
  const [reservation, setReservation] = useState(null);

  const selectedCategory = useMemo(
    () => fleet.find((item) => item.category === booking.category) || fleet[0],
    [fleet, booking.category],
  );

  const routeAllowed = useMemo(() => {
    const origin = airports.find((airport) => airport.code === booking.pickup);
    const destination = airports.find((airport) => airport.code === booking.destination);
    if (!origin || !destination) return false;
    return origin.state === 'NJ' && ['NJ', 'NY', 'PA'].includes(destination.state);
  }, [airports, booking.pickup, booking.destination]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setBooking((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!routeAllowed) {
      alert('This airport route is not available under the current service policy.');
      return;
    }

    const payload = {
      ...booking,
      vehicleId: selectedCategory.id,
      category: selectedCategory.category,
      total: selectedCategory.price,
      name: booking.name || 'Guest Traveler',
    };

    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      alert(data.message || 'Unable to submit reservation.');
      return;
    }

    setReservation(data.reservation);
    setSubmitted(true);
    setSteps({ current: 4, total: 4 });
    onBookingSuccess();
  };

  return (
    <main className="page-shell booking-layout">
      <div className="booking-form-panel">
        <div className="section-head left">
          <span className="eyebrow">Reserve your journey</span>
          <h2>Luxury booking experience.</h2>
        </div>

        <div className="booking-progress">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className={`progress-dot ${step <= steps.current ? 'active' : ''}`} />
          ))}
        </div>

        {!submitted ? (
          <form className="booking-form" onSubmit={handleSubmit}>
            <div className="field-grid two-col">
              <label>
                Pickup airport
                <select name="pickup" value={booking.pickup} onChange={handleChange}>
                  {airports.map((airport) => (
                    <option key={airport.code} value={airport.code}>{airport.code} — {airport.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Destination airport
                <select name="destination" value={booking.destination} onChange={handleChange}>
                  {airports.map((airport) => (
                    <option key={airport.code} value={airport.code}>{airport.code} — {airport.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-grid two-col">
              <label>
                Pickup date
                <input type="date" name="date" value={booking.date} onChange={handleChange} />
              </label>
              <label>
                Pickup time
                <input type="time" name="time" value={booking.time} onChange={handleChange} />
              </label>
            </div>

            <div className="field-grid two-col">
              <label>
                Passenger name
                <input type="text" name="name" value={booking.name} onChange={handleChange} placeholder="Alex Morgan" />
              </label>
              <label>
                Flight number
                <input type="text" name="flightNumber" value={booking.flightNumber} onChange={handleChange} placeholder="AA188" />
              </label>
            </div>

            <div className="field-grid three-col">
              <label>
                Passengers
                <input type="number" name="passengers" value={booking.passengers} min="1" max="8" onChange={handleChange} />
              </label>
              <label>
                Luggage
                <input type="number" name="luggage" value={booking.luggage} min="0" max="8" onChange={handleChange} />
              </label>
              <label>
                Vehicle category
                <select name="category" value={booking.category} onChange={handleChange}>
                  {fleet.map((item) => (
                    <option key={item.id} value={item.category}>{item.category}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Special requests
              <textarea name="notes" value={booking.notes} onChange={handleChange} rows="4" placeholder="Quiet ride, child seat, extra water, meet and greet..." />
            </label>

            {!routeAllowed && (
              <div className="alert-box">
                This route is not available under the current launch policy. New Jersey airport pickups and approved airport destinations only.
              </div>
            )}

            <div className="summary-box">
              <div>
                <span>Vehicle</span>
                <strong>{selectedCategory?.category}</strong>
              </div>
              <div>
                <span>Estimated</span>
                <strong>${selectedCategory?.price}</strong>
              </div>
            </div>

            <button type="submit" className="btn btn-primary full-width">Confirm reservation</button>
          </form>
        ) : (
          <div className="success-box">
            <span className="eyebrow">Reservation confirmed</span>
            <h3>{reservation?.category}</h3>
            <p>{reservation?.pickup} → {reservation?.destination}</p>
            <p>{reservation?.date} at {reservation?.time}</p>
            <strong>${reservation?.total}</strong>
            <Link to="/dashboard" className="btn btn-primary">View dashboard</Link>
          </div>
        )}
      </div>

      <aside className="booking-side-panel">
        <div className="side-card primary">
          <span className="eyebrow light">Service details</span>
          <h3>Professional airport chauffeur service</h3>
          <ul>
            <li>Flight-aware scheduling and airport coordination</li>
            <li>Discreet, luxury transport for personal and executive travel</li>
            <li>Transparent pricing and premium support</li>
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

function CustomerDashboardPage({ user, reservations }) {
  const currentUser = user || { name: 'Guest Traveler' };

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-head left">
        <span className="eyebrow">Customer portal</span>
        <h2>Welcome back, {currentUser.name.split(' ')[0]}.</h2>
      </div>
      <div className="dashboard-grid">
        <div className="card-panel">
          <h3>Upcoming reservations</h3>
          {reservations.slice(0, 3).map((reservation) => (
            <div className="reservation-row" key={reservation.id}>
              <strong>{reservation.category}</strong>
              <span>{reservation.pickup} → {reservation.destination}</span>
              <small>{reservation.date} • {reservation.status}</small>
            </div>
          ))}
        </div>
        <div className="card-panel">
          <h3>Travel preferences</h3>
          <ul className="simple-list">
            <li>Preferred vehicle: First Class</li>
            <li>Quiet cabin preference</li>
            <li>Airport meet-and-greet on arrival</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

function AdminPage({ metrics, reservations }) {
  return (
    <main className="page-shell admin-shell">
      <div className="section-head left">
        <span className="eyebrow">Operations dashboard</span>
        <h2>Dispatch and reservation control.</h2>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Today</span><strong>{metrics?.reservationsToday || 0}</strong></div>
        <div className="stat-card"><span>Active trips</span><strong>{metrics?.activeTrips || 0}</strong></div>
        <div className="stat-card"><span>Pending</span><strong>{metrics?.pendingApprovals || 0}</strong></div>
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
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td>{reservation.customer}</td>
                  <td>{reservation.pickup} → {reservation.destination}</td>
                  <td>{reservation.category}</td>
                  <td><span className="status-pill">{reservation.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function PartnerPage() {
  return (
    <main className="page-shell small-shell">
      <div className="section-head left">
        <span className="eyebrow">Partner portal</span>
        <h2>Invitation-only network operations.</h2>
      </div>
      <div className="portal-grid">
        <div className="card-panel">
          <h3>Pending invitations</h3>
          <ul className="simple-list">
            <li>North Shore Transfer Group — accepted</li>
            <li>Hudson Valley Motion — pending review</li>
            <li>Garden State Executive — invitation issued</li>
          </ul>
        </div>
        <div className="card-panel">
          <h3>Operational highlights</h3>
          <ul className="simple-list">
            <li>Fleet availability managed daily</li>
            <li>Vehicle approvals require admin review</li>
            <li>Assignment acceptance monitored</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

function ChauffeurPage() {
  return (
    <main className="page-shell small-shell">
      <div className="section-head left">
        <span className="eyebrow">Chauffeur portal</span>
        <h2>Route readiness and trip updates.</h2>
      </div>
      <div className="portal-grid">
        <div className="card-panel">
          <h3>Assigned trips</h3>
          <ul className="simple-list">
            <li>EWR → Manhattan • 18:30 • First Class</li>
            <li>TEB → PHL • 09:00 • Business Class</li>
          </ul>
        </div>
        <div className="card-panel">
          <h3>Status updates</h3>
          <ul className="simple-list">
            <li>Vehicle verified</li>
            <li>Airport instructions reviewed</li>
            <li>Passenger notes confirmed</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

function AuthPage({ authMode, setAuthMode, authForm, setAuthForm, onSubmit }) {
  return (
    <main className="page-shell auth-shell">
      <div className="auth-card">
        <div className="auth-tabs">
          <button type="button" className={authMode === 'login' ? 'tab active' : 'tab'} onClick={() => setAuthMode('login')}>Login</button>
          <button type="button" className={authMode === 'register' ? 'tab active' : 'tab'} onClick={() => setAuthMode('register')}>Register</button>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          {authMode === 'register' && (
            <label>
              Full name
              <input type="text" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Alex Morgan" />
            </label>
          )}

          <label>
            Email address
            <input type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} placeholder="you@aurelia.com" />
          </label>

          <label>
            Password
            <input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
          </label>

          <button type="submit" className="btn btn-primary full-width">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </div>
    </main>
  );
}

function ContactPage() {
  return (
    <main className="page-shell small-shell">
      <div className="section-head left">
        <span className="eyebrow">Contact</span>
        <h2>Concierge support for every route.</h2>
      </div>
      <div className="contact-panel card-panel">
        <p>Email: concierge@aureliachauffeur.com</p>
        <p>Phone: +1 (212) 555-0188</p>
        <p>Hours: 24/7 for reservation and operational support</p>
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
