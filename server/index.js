import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import Stripe from 'stripe';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3001);
const SESSION_COOKIE = 'aurelia_session';
const isTestEnvironment = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
const JWT_SECRET = process.env.JWT_SECRET || (isTestEnvironment ? 'test-only-jwt-secret' : randomBytes(32).toString('hex'));
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-with'))) {
  throw new Error('Set JWT_SECRET to at least 32 random characters in production.');
}
const databaseUrl = process.env.DATABASE_URL;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const pool = databaseUrl ? new pg.Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL === 'true',
}) : null;

const airportCatalog = [
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

const fleetCatalog = [
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
    basePrice: 220,
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
    basePrice: 310,
    available: true,
  },
  {
    id: 'luxury-suv',
    category: 'Luxury SUV',
    name: 'Luxury SUV',
    description: 'Cadillac Escalade or Similar',
    vehicles: ['Cadillac Escalade', 'Cadillac Escalade ESV', 'Mercedes GLS 580'],
    seats: 6,
    luggage: 5,
    amenities: ['Extra luggage room', 'Executive seating', 'Premium climate control', 'Airport meet-and-greet'],
    image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80',
    basePrice: 380,
    available: true,
  },
];

const testUsers = [];
const testReservations = [];

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
}

function setSessionCookie(res, user) {
  res.cookie(SESSION_COOKIE, createToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

function readSqlFile(filename) {
  return readFileSync(path.join(__dirname, 'migrations', filename), 'utf8');
}

async function initializeDatabase() {
  if (!pool) {
    if (!isTestEnvironment) throw new Error('DATABASE_URL is required to start the API.');
    return;
  }
  const files = ['001_init.sql', '002_seed.sql'];

  for (const file of files) {
    const sql = readSqlFile(file);
    await pool.query(sql);
  }
}

function getPopulationSummary(rows) {
  return rows.map((row) => ({
    ...row,
    customer: row.customer_name,
    pickup: row.pickup_airport_code,
    destination: row.destination_airport_code,
    date: row.pickup_date,
    time: row.pickup_time,
    category: row.vehicle_category,
    total: Number(row.quote_total ?? 0),
    status: String(row.status || 'pending_confirmation'),
  }));
}

async function listAirports() {
  if (pool) {
    const result = await pool.query('select * from public.airports where active = true order by code asc');
    return result.rows;
  }

  return airportCatalog;
}

async function listFleet() {
  if (pool) {
    const result = await pool.query('select * from public.fleet_categories where active = true order by base_price asc');
    return result.rows.map((row) => ({
      id: row.slug,
      category: row.name,
      name: row.name,
      description: row.description,
      vehicles: row.vehicles || [],
      seats: Number(row.seats),
      luggage: Number(row.luggage),
      amenities: ['Professional chauffeur', 'Climate control', 'Executive comfort'],
      image: row.image_url,
      basePrice: Number(row.base_price),
      price: Number(row.base_price),
      available: row.active,
    }));
  }

  return fleetCatalog.map((entry) => ({ ...entry, price: entry.basePrice }));
}

async function listReservationsForUser(userId) {
  if (pool) {
    const result = await pool.query(
      'select * from public.reservations where customer_id = $1 order by created_at desc',
      [userId],
    );
    return getPopulationSummary(result.rows);
  }

  return testReservations.filter((reservation) => reservation.customer_id === userId);
}

async function listAllReservations() {
  if (pool) {
    const result = await pool.query('select * from public.reservations order by created_at desc');
    return getPopulationSummary(result.rows);
  }

  return testReservations;
}

async function getReservationById(id) {
  if (pool) {
    const result = await pool.query('select * from public.reservations where id = $1', [id]);
    return result.rows[0] || null;
  }

  return testReservations.find((reservation) => reservation.id === id) || null;
}

async function findUserByEmail(email) {
  if (pool) {
    const result = await pool.query(
      'select id, name, email, role, password_hash, is_active from public.users where email = $1',
      [email],
    );
    return result.rows[0] || null;
  }

  return testUsers.find((user) => user.email === email) || null;
}

async function findUserById(id) {
  if (pool) {
    const result = await pool.query(
      'select id, name, email, role, is_active from public.users where id = $1',
      [id],
    );
    return result.rows[0] || null;
  }

  return testUsers.find((user) => user.id === id) || null;
}

async function validAirportRoute(originCode, destinationCode) {
  let airports = airportCatalog;
  if (pool) {
    const result = await pool.query(
      'select code, state from public.airports where active = true and code = any($1::text[])',
      [[originCode, destinationCode]],
    );
    airports = result.rows;
  }
  const origin = airports.find((airport) => airport.code === originCode);
  const destination = airports.find((airport) => airport.code === destinationCode);

  if (!origin || !destination) return false;
  if (origin.state !== 'NJ') return false;
  return ['NJ', 'NY', 'PA'].includes(destination.state);
}

function getPaymentQuote(category, payload) {
  const base = category.basePrice ?? category.price ?? 220;
  const serviceFee = 0.08 * base;
  const airportSurcharge = payload.pickup === 'EWR' || payload.destination === 'JFK' ? 35 : 0;
  const total = Math.round((base + serviceFee + airportSurcharge) * 100) / 100;

  return {
    base,
    serviceFee,
    airportSurcharge,
    total,
  };
}

async function authenticateRequest(req) {
  const header = req.headers.authorization || '';
  const cookieToken = (req.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : cookieToken;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.sub);
    if (!user || user.is_active === false) return null;
    return { sub: user.id, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const user = await authenticateRequest(req);
  if (!user) return res.status(401).json({ message: 'Authentication required or session expired.' });
  req.user = user;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'You are not authorized to access this resource.' });
    }
    next();
  };
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

app.use(helmet());
const allowedOrigins = [process.env.CLIENT_URL];
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));
const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Aurelia Chauffeur API', secureMode: true });
});

app.get('/api/airports', async (req, res) => {
  res.json(await listAirports());
});

app.get('/api/fleet', async (req, res) => {
  res.json(await listFleet());
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await findUserById(req.user.sub);
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/my-reservations', requireAuth, async (req, res) => {
  res.json(await listReservationsForUser(req.user.email));
});

app.get('/api/admin/reservations', requireAuth, requireRole('admin'), async (req, res) => {
  res.json(await listAllReservations());
});

app.get('/api/admin/overview', requireAuth, requireRole('admin'), async (req, res) => {
  const reservations = await listAllReservations();
  const fleetEntries = await listFleet();
  res.json({
    reservationsToday: reservations.length,
    activeTrips: reservations.filter((item) => ['assigned', 'in_transit'].includes(item.status)).length,
    pendingApprovals: reservations.filter((item) => item.status === 'pending_confirmation').length,
    availableVehicles: fleetEntries.length,
    revenue: reservations.reduce((total, item) => total + Number(item.quote_total || 0), 0),
  });
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);
  const passwordHash = user?.password_hash || user?.passwordHash;

  if (!user || user.is_active === false || !(await bcrypt.compare(String(password), passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const safeUser = sanitizeUser(user);
  setSessionCookie(res, safeUser);
  res.json({ user: safeUser });
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || String(password).length < 8) {
    return res.status(400).json({ message: 'Name, email, and a password with at least 8 characters are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  let newUser;

  if (pool) {
    const result = await pool.query(
      `insert into public.users (name, email, password_hash, role)
       values ($1, $2, $3, 'customer')
       returning id, name, email, role`,
      [String(name).trim(), normalizedEmail, passwordHash],
    );
    newUser = result.rows[0];
  } else {
    newUser = {
      id: randomUUID(),
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'customer',
      is_active: true,
    };
    testUsers.push(newUser);
  }

  const safeUser = sanitizeUser(newUser);
  setSessionCookie(res, safeUser);
  res.status(201).json({ user: safeUser });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.status(204).end();
});

app.post('/api/reservations', async (req, res) => {
  const payload = req.body || {};
  const requiredFields = ['pickup', 'destination', 'date', 'time', 'name'];

  if (requiredFields.some((field) => !payload[field])) {
    return res.status(400).json({ message: 'Pickup, destination, date, time, and traveler name are required.' });
  }

  const isValidRoute = await validAirportRoute(payload.pickup, payload.destination);
  if (!isValidRoute) {
    return res.status(400).json({
      message: 'This route is not available under the current launch policy. Pickup must be a New Jersey airport and destination must be an approved airport in New Jersey, New York, or Pennsylvania.',
    });
  }

  req.user = await authenticateRequest(req);
  if (!req.user) return res.status(401).json({ message: 'Authentication required or session expired.' });

  const categoryName = payload.vehicleCategory || payload.category || 'Business Class';
  const fleetEntries = await listFleet();
  const fleetEntry = fleetEntries.find((item) => item.category === categoryName || item.id === payload.vehicleId);
  if (!fleetEntry) return res.status(400).json({ message: 'Select a valid vehicle category.' });
  const quote = getPaymentQuote(fleetEntry, payload);

  const reservation = {
    id: `res-${randomUUID().slice(0, 8)}`,
    customer_id: req.user.sub,
    customer_name: payload.name,
    customer_email: req.user.email,
    pickup_airport_code: payload.pickup,
    destination_airport_code: payload.destination,
    pickup_date: payload.date,
    pickup_time: payload.time,
    flight_number: payload.flightNumber || payload.flight_number || '',
    vehicle_category: fleetEntry.category,
    quote_total: quote.total,
    total: quote.total,
    pickup: payload.pickup,
    destination: payload.destination,
    date: payload.date,
    time: payload.time,
    category: fleetEntry.category,
    status: 'pending_confirmation',
    notes: payload.notes || '',
  };

  if (pool) {
    const insert = await pool.query(
      `
        insert into public.reservations (
          customer_id,
          customer_name,
          customer_email,
          pickup_airport_code,
          destination_airport_code,
          pickup_date,
          pickup_time,
          flight_number,
          vehicle_category,
          quote_total,
          status,
          notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning *
      `,
      [
        req.user.sub,
        reservation.customer_name,
        reservation.customer_email,
        reservation.pickup_airport_code,
        reservation.destination_airport_code,
        reservation.pickup_date,
        reservation.pickup_time,
        reservation.flight_number,
        reservation.vehicle_category,
        reservation.quote_total,
        reservation.status,
        reservation.notes,
      ],
    );

    reservation.id = insert.rows[0].id;
    reservation.quote_total = Number(insert.rows[0].quote_total);
  } else {
    testReservations.unshift({ ...reservation });
  }

  res.status(201).json({
    message: 'Reservation created successfully.',
    reservation,
    quote,
  });
});

app.post('/api/admin/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { reservationId, chauffeur } = req.body;
  const reservation = await getReservationById(reservationId);

  if (!reservation) {
    return res.status(404).json({ message: 'Reservation not found.' });
  }

  if (pool) {
    const updated = await pool.query(
      'update public.reservations set status = $1, updated_at = now() where id = $2 returning *',
      ['assigned', reservationId],
    );
    return res.json({ message: 'Chauffeur assigned.', reservation: updated.rows[0] });
  }

  const target = testReservations.find((entry) => entry.id === reservationId);
  target.status = 'assigned';
  target.chauffeur = chauffeur || 'Adele Brooks';
  return res.json({ message: 'Chauffeur assigned.', reservation: target });
});

app.post('/api/payments/checkout-session', requireAuth, async (req, res) => {
  const reservation = await getReservationById(req.body.reservationId);
  if (!reservation || reservation.customer_id !== req.user.sub) {
    return res.status(404).json({ message: 'Reservation not found.' });
  }
  const amount = Number(reservation.quote_total);

  if (!stripe) {
    return res.status(503).json({ message: 'Payment provider is not configured.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Aurelia Chauffeur ride' }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5174'}/booking?paid=1`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5174'}/booking?paid=0`,
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout initialization failed:', error.message);
    res.status(502).json({ message: 'Payment initialization failed.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

if (isMainModule) {
  initializeDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`Aurelia Chauffeur API running on http://localhost:${PORT}`);
    });
  }).catch((error) => {
    console.error('API startup failed:', error.message);
    if (pool) pool.end();
    process.exitCode = 1;
  });
}

export { app };
