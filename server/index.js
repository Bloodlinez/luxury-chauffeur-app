import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const airports = [
  { code: 'EWR', name: 'Newark Liberty International Airport', state: 'NJ', city: 'Newark', region: 'New Jersey', active: true },
  { code: 'TEB', name: 'Teterboro Airport', state: 'NJ', city: 'Teterboro', region: 'New Jersey', active: true },
  { code: 'ACY', name: 'Atlantic City International Airport', state: 'NJ', city: 'Atlantic City', region: 'New Jersey', active: true },
  { code: 'TTN', name: 'Trenton–Mercer Airport', state: 'NJ', city: 'Ewing', region: 'New Jersey', active: true },
  { code: 'JFK', name: 'John F. Kennedy International Airport', state: 'NY', city: 'New York', region: 'New York City', active: true },
  { code: 'LGA', name: 'LaGuardia Airport', state: 'NY', city: 'New York', region: 'New York City', active: true },
  { code: 'PHL', name: 'Philadelphia International Airport', state: 'PA', city: 'Philadelphia', region: 'Pennsylvania', active: true },
  { code: 'ABE', name: 'Lehigh Valley International Airport', state: 'PA', city: 'Allentown', region: 'Pennsylvania', active: true },
  { code: 'PIT', name: 'Pittsburgh International Airport', state: 'PA', city: 'Pittsburgh', region: 'Pennsylvania', active: true },
];

const fleet = [
  {
    id: 'business-class',
    category: 'Business Class',
    name: 'Business Class',
    description: 'Mercedes-Benz E-Class or Similar',
    vehicles: ['Mercedes-Benz E-Class', 'BMW 5 Series', 'Audi A6'],
    seats: 4,
    luggage: 3,
    amenities: ['Professional chauffeur', 'Climate control', 'Charging', 'Bottled water'],
    image: 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=900&q=80',
    price: 220,
    available: true,
  },
  {
    id: 'first-class',
    category: 'First Class',
    name: 'First Class',
    description: 'Mercedes-Benz S-Class or Similar',
    vehicles: ['Mercedes-Benz S-Class', 'BMW 7 Series', 'Audi A8 L'],
    seats: 4,
    luggage: 3,
    amenities: ['Executive leather seating', 'Quiet cabin', 'Complimentary refreshments', 'Privacy glass'],
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80',
    price: 310,
    available: true,
  },
  {
    id: 'luxury-suv',
    category: 'Luxury SUV',
    name: 'Luxury SUV',
    description: 'Cadillac Escalade or Similar',
    vehicles: ['Cadillac Escalade', 'Cadillac Escalade ESV', 'Mercedes-Benz GLS 580'],
    seats: 6,
    luggage: 5,
    amenities: ['Extra luggage room', 'Executive seating', 'Premium climate control', 'Airport meet-and-greet'],
    image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80',
    price: 380,
    available: true,
  },
];

const users = [
  { id: 'u1', name: 'Bilal Hassan', email: 'customer@aurelia.com', password: 'demo123', role: 'customer' },
  { id: 'u2', name: 'Ava Stone', email: 'admin@aurelia.com', password: 'admin123', role: 'admin' },
  { id: 'u3', name: 'Leo Grant', email: 'partner@aurelia.com', password: 'partner123', role: 'partner' },
  { id: 'u4', name: 'Maya Chen', email: 'chauffeur@aurelia.com', password: 'chauffeur123', role: 'chauffeur' },
];

const reservations = [
  {
    id: 'res-1001',
    customer: 'Bilal Hassan',
    pickup: 'EWR',
    destination: 'JFK',
    date: '2026-12-15',
    time: '18:30',
    flightNumber: 'AA280',
    category: 'First Class',
    total: 310,
    status: 'Confirmed',
  },
  {
    id: 'res-1002',
    customer: 'Ava Stone',
    pickup: 'TEB',
    destination: 'PHL',
    date: '2026-12-18',
    time: '09:00',
    flightNumber: 'DL114',
    category: 'Business Class',
    total: 220,
    status: 'Assigned',
  },
];

function validAirportRoute(originCode, destinationCode) {
  const origin = airports.find((airport) => airport.code === originCode);
  const destination = airports.find((airport) => airport.code === destinationCode);

  if (!origin || !destination) return false;

  if (origin.state !== 'NJ') return false;

  const allowedDestinations = ['NJ', 'NY', 'PA'];
  return allowedDestinations.includes(destination.state);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Aurelia Chauffeur API' });
});

app.get('/api/airports', (req, res) => {
  res.json(airports);
});

app.get('/api/fleet', (req, res) => {
  res.json(fleet);
});

app.get('/api/reservations', (req, res) => {
  res.json(reservations);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find((entry) => entry.email === email && entry.password === password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const { password: _password, ...safeUser } = user;
  res.json({ user: safeUser, token: `demo-token-${user.id}` });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  const existing = users.find((user) => user.email === email);
  if (existing) {
    return res.status(409).json({ message: 'User already exists.' });
  }

  const newUser = {
    id: `u${Date.now()}`,
    name,
    email,
    password,
    role: 'customer',
  };

  users.push(newUser);
  const { password: _password, ...safeUser } = newUser;
  res.status(201).json({ user: safeUser, token: `demo-token-${newUser.id}` });
});

app.get('/api/admin/overview', (req, res) => {
  res.json({
    reservationsToday: reservations.length,
    activeTrips: 4,
    pendingApprovals: 3,
    availableVehicles: fleet.length,
    revenue: 12480,
  });
});

app.post('/api/reservations', (req, res) => {
  const payload = req.body;

  if (!payload.pickup || !payload.destination || !payload.date || !payload.time || !payload.name) {
    return res.status(400).json({ message: 'Pickup, destination, date, time and name are required.' });
  }

  const isValidRoute = validAirportRoute(payload.pickup, payload.destination);
  if (!isValidRoute) {
    return res.status(400).json({
      message: 'This route is not available under the current launch policy. Pickups must originate from a New Jersey airport and destinations must be approved airport destinations.',
    });
  }

  const selectedCategory = fleet.find((item) => item.category === payload.category || item.id === payload.vehicleId) || fleet[0];
  const newReservation = {
    id: `res-${Date.now()}`,
    customer: payload.name,
    pickup: payload.pickup,
    destination: payload.destination,
    date: payload.date,
    time: payload.time,
    flightNumber: payload.flightNumber || 'N/A',
    category: selectedCategory.category,
    total: Number(payload.total || selectedCategory.price),
    status: 'Pending Confirmation',
    createdAt: new Date().toISOString(),
  };

  reservations.unshift(newReservation);

  res.status(201).json({
    message: 'Reservation submitted successfully.',
    reservation: newReservation,
  });
});

app.post('/api/admin/assign', (req, res) => {
  const { reservationId, chauffeur } = req.body;
  const reservation = reservations.find((entry) => entry.id === reservationId);

  if (!reservation) {
    return res.status(404).json({ message: 'Reservation not found.' });
  }

  reservation.status = 'Assigned';
  reservation.chauffeur = chauffeur || 'Adele Brooks';

  res.json({ message: 'Chauffeur assigned.', reservation });
});

app.listen(PORT, () => {
  console.log(`Aurelia Chauffeur API running on http://localhost:${PORT}`);
});
