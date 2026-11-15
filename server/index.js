import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
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

const ALLOWED_FLEET_CATEGORIES = {
  'business-class': {
    category: 'Business Class',
    description: 'Mercedes E-Class or Similar',
    defaultMakeModel: 'Mercedes E-Class',
    seats: 4,
    luggage: 3,
  },
  'first-class': {
    category: 'First Class',
    description: 'Mercedes S-Class or Similar',
    defaultMakeModel: 'Mercedes S-Class',
    seats: 4,
    luggage: 3,
  },
  'luxury-suv': {
    category: 'Luxury SUV',
    description: 'Cadillac Escalade or Similar',
    defaultMakeModel: 'Cadillac Escalade',
    seats: 6,
    luggage: 5,
  },
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SERVICE_AREA_STATES = ['NJ', 'NY', 'PA'];
const NJ_PICKUP_AIRPORTS = ['EWR', 'TEB', 'ACY', 'TTN'];

const fleetCatalog = [
  {
    id: 'business-class',
    category: 'Business Class',
    name: 'Business Class',
    description: 'Mercedes E-Class or Similar',
    vehicles: ['Mercedes E-Class', 'BMW 5 Series', 'Audi A6'],
    seats: 4,
    luggage: 3,
    amenities: ['Professional chauffeur', 'Climate control', 'Charging', 'Bottled water'],
    image: '/fleet/business-class.jpg',
    basePrice: 220,
    available: true,
  },
  {
    id: 'first-class',
    category: 'First Class',
    name: 'First Class',
    description: 'Mercedes S-Class or Similar',
    vehicles: ['Mercedes S-Class', 'BMW 7 Series', 'Audi A8 L'],
    seats: 4,
    luggage: 3,
    amenities: ['Executive leather seating', 'Quiet cabin', 'Complimentary refreshments', 'Privacy glass'],
    image: '/fleet/first-class.jpg',
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
    image: '/fleet/luxury-suv.jpg',
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
  await pool.query(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const files = readdirSync(path.join(__dirname, 'migrations'))
    .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const alreadyApplied = await pool.query(
      'select 1 from public.schema_migrations where name = $1',
      [file],
    );
    if (alreadyApplied.rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(readSqlFile(file));
      await client.query('insert into public.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

function formatAddressLabel(line1, city, state, postal) {
  const parts = [line1, city, [state, postal].filter(Boolean).join(' ')].filter(Boolean);
  return parts.join(', ');
}

function formatEndpointLabel({ airportCode, line1, city, state, postal }) {
  if (airportCode) return airportCode;
  return formatAddressLabel(line1, city, state, postal) || 'Address pending';
}

function getPopulationSummary(rows) {
  return rows.map((row) => {
    const pickup = formatEndpointLabel({
      airportCode: row.pickup_airport_code,
      line1: row.pickup_address_line1,
      city: row.pickup_city,
      state: row.pickup_state,
      postal: row.pickup_postal,
    });
    const destination = formatEndpointLabel({
      airportCode: row.destination_airport_code,
      line1: row.destination_address_line1,
      city: row.destination_city,
      state: row.destination_state,
      postal: row.destination_postal,
    });
    return {
      ...row,
      customer: row.customer_name,
      pickup,
      destination,
      pickupLabel: pickup,
      destinationLabel: destination,
      transferType: row.transfer_type || null,
      date: row.pickup_date,
      time: row.pickup_time,
      category: row.vehicle_category,
      total: Number(row.quote_total ?? 0),
      status: String(row.status || 'pending_confirmation'),
      addressVerified: Boolean(row.address_verified),
    };
  });
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
      image: row.image_url || `/fleet/${row.slug}.jpg`,
      imageReady: Boolean(row.image_url),
      basePrice: Number(row.base_price),
      price: Number(row.base_price),
      available: row.active,
    }));
  }

  return fleetCatalog.map((entry) => ({ ...entry, price: entry.basePrice, imageReady: false }));
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
    const result = await pool.query(
      `select r.*, c.full_name as chauffeur_name
       from public.reservations r
       left join public.chauffeurs c on c.id = r.assigned_chauffeur_id
       order by r.created_at desc`,
    );
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
  const origin = await findAirport(originCode);
  const destination = await findAirport(destinationCode);
  if (!origin || !destination) return false;
  if (!NJ_PICKUP_AIRPORTS.includes(origin.code)) return false;
  return SERVICE_AREA_STATES.includes(destination.state);
}

function getPaymentQuote(category, payload) {
  const base = category.basePrice ?? category.price ?? 220;
  const serviceFee = 0.08 * base;
  const airportCode = payload.quoteAirportCode || payload.pickup || payload.destination;
  const airportSurcharge = airportCode === 'EWR' || airportCode === 'JFK' ? 35 : 0;
  const total = Math.round((base + serviceFee + airportSurcharge) * 100) / 100;

  return {
    base,
    serviceFee,
    airportSurcharge,
    total,
  };
}

function parseWholeNumber(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function getRideCounts(payload, category) {
  const passengers = parseWholeNumber(payload.passengers ?? 1);
  const luggage = parseWholeNumber(payload.luggage ?? 0);
  if (passengers === null || passengers < 1 || passengers > category.seats) {
    return {
      error: `${category.category} accommodates 1 to ${category.seats} passengers.`,
      field: 'passengers',
    };
  }
  if (luggage === null || luggage < 0 || luggage > category.luggage) {
    return {
      error: `${category.category} accommodates 0 to ${category.luggage} bags.`,
      field: 'luggage',
    };
  }
  return { passengers, luggage };
}

function normalizeState(value) {
  return String(value || '').trim().toUpperCase();
}

function readAddress(payload, prefix) {
  return {
    line1: String(payload?.[`${prefix}AddressLine1`] || payload?.[`${prefix}_address_line1`] || '').trim(),
    line2: String(payload?.[`${prefix}AddressLine2`] || payload?.[`${prefix}_address_line2`] || '').trim(),
    city: String(payload?.[`${prefix}City`] || payload?.[`${prefix}_city`] || '').trim(),
    state: normalizeState(payload?.[`${prefix}State`] || payload?.[`${prefix}_state`]),
    postal: String(payload?.[`${prefix}Postal`] || payload?.[`${prefix}Zip`] || payload?.[`${prefix}_postal`] || '').trim(),
  };
}

function validateServiceAddress(address, fieldPrefix) {
  const errors = {};
  if (!address.line1) errors[`${fieldPrefix}AddressLine1`] = 'Enter the street address.';
  if (!address.city) errors[`${fieldPrefix}City`] = 'Enter the city.';
  if (!SERVICE_AREA_STATES.includes(address.state)) {
    errors[`${fieldPrefix}State`] = 'Address must be in New Jersey, New York, or Pennsylvania.';
  }
  if (!address.postal) errors[`${fieldPrefix}Postal`] = 'Enter the ZIP code.';
  else if (!/^\d{5}(-\d{4})?$/.test(address.postal)) {
    errors[`${fieldPrefix}Postal`] = 'Enter a valid ZIP code.';
  }
  return errors;
}

async function findAirport(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  if (pool) {
    const result = await pool.query(
      'select code, state from public.airports where active = true and code = $1',
      [normalized],
    );
    return result.rows[0] || null;
  }
  return airportCatalog.find((airport) => airport.code === normalized) || null;
}

async function validateTransfer(payload) {
  const transferType = String(payload.transferType || payload.transfer_type || '').trim();
  const errors = {};
  if (!['from_airport', 'to_airport'].includes(transferType)) {
    errors.transferType = 'Choose From Airport or To Airport.';
    return { errors, transferType: null };
  }

  let pickupAirportCode = null;
  let destinationAirportCode = null;
  let pickupAddress = { line1: '', line2: '', city: '', state: '', postal: '' };
  let destinationAddress = { line1: '', line2: '', city: '', state: '', postal: '' };
  let quoteAirportCode = null;

  if (transferType === 'from_airport') {
    const airport = await findAirport(payload.pickupAirport || payload.pickup);
    if (!airport || !NJ_PICKUP_AIRPORTS.includes(airport.code)) {
      errors.pickupAirport = 'Select an approved New Jersey pickup airport (EWR, TEB, ACY, or TTN).';
    } else {
      pickupAirportCode = airport.code;
      quoteAirportCode = airport.code;
    }
    destinationAddress = readAddress(payload, 'destination');
    Object.assign(errors, validateServiceAddress(destinationAddress, 'destination'));
  } else {
    pickupAddress = readAddress(payload, 'pickup');
    Object.assign(errors, validateServiceAddress(pickupAddress, 'pickup'));
    const airport = await findAirport(payload.destinationAirport || payload.destination);
    if (!airport || !SERVICE_AREA_STATES.includes(airport.state)) {
      errors.destinationAirport = 'Select an approved destination airport in New Jersey, New York, or Pennsylvania.';
    } else {
      destinationAirportCode = airport.code;
      quoteAirportCode = airport.code;
    }
  }

  return {
    errors,
    transferType,
    pickupAirportCode,
    destinationAirportCode,
    pickupAddress,
    destinationAddress,
    quoteAirportCode,
  };
}

function isBannedVehicleModel(value) {
  return /infiniti\s*qx\s*80/i.test(String(value || ''));
}

function isFuturePickup(date, time) {
  if (!date || !time) return false;
  const pickupAt = new Date(`${date}T${time}`);
  if (Number.isNaN(pickupAt.getTime())) return false;
  return pickupAt.getTime() > Date.now();
}

function validationError(res, message, errors = {}) {
  return res.status(400).json({ message, errors });
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

function hashInvitationToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function createInvitationToken() {
  return randomBytes(32).toString('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveCategorySlug(input) {
  const value = String(input || '').trim().toLowerCase();
  if (ALLOWED_FLEET_CATEGORIES[value]) return value;
  const byName = Object.entries(ALLOWED_FLEET_CATEGORIES).find(([, meta]) => meta.category.toLowerCase() === value);
  return byName ? byName[0] : null;
}

async function findPartnerByOwner(userId, client = pool) {
  if (!client) return null;
  const result = await client.query(
    `select id, owner_user_id, company_name, contact_email, phone, address, notes, status, created_at, updated_at
     from public.partners
     where owner_user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function requireActivePartner(req, res, next) {
  if (!pool) return res.status(503).json({ message: 'Partner operations require PostgreSQL.' });
  const partner = await findPartnerByOwner(req.user.sub);
  if (!partner) return res.status(404).json({ message: 'Partner profile not found.' });
  if (partner.status === 'suspended') {
    return res.status(403).json({ message: 'This partner account is suspended.' });
  }
  if (!['approved', 'active'].includes(partner.status)) {
    return res.status(403).json({ message: 'Partner account is awaiting administrator approval.' });
  }
  req.partner = partner;
  next();
}

function serializePartner(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name,
    contactEmail: row.contact_email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    status: row.status,
    ownerName: row.owner_name || null,
    ownerEmail: row.owner_email || null,
    chauffeurCount: Number(row.chauffeur_count || 0),
    vehicleCount: Number(row.vehicle_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeVehicle(row) {
  const meta = ALLOWED_FLEET_CATEGORIES[row.category_slug] || {};
  return {
    id: row.id,
    partnerId: row.partner_id,
    categorySlug: row.category_slug,
    category: meta.category || row.category_slug,
    makeModel: row.make_model,
    licensePlate: row.license_plate,
    color: row.color,
    year: row.year,
    seats: Number(row.seats),
    luggage: Number(row.luggage),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeInvitation(row, { includeToken = false, token = null } = {}) {
  return {
    id: row.id,
    companyName: row.company_name,
    contactEmail: row.contact_email,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    partnerId: row.partner_id,
    createdAt: row.created_at,
    status: row.revoked_at
      ? 'revoked'
      : row.used_at
        ? 'accepted'
        : new Date(row.expires_at) < new Date()
          ? 'expired'
          : 'pending',
    ...(includeToken && token ? { token, invitePath: `/partner/join?token=${token}` } : {}),
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
  res.json(await listReservationsForUser(req.user.sub));
});

app.get('/api/admin/reservations', requireAuth, requireRole('admin'), async (req, res) => {
  res.json(await listAllReservations());
});

app.get('/api/admin/chauffeurs', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.json([]);
  const result = await pool.query(
    `select c.id, c.full_name, c.phone, c.status, c.partner_id, p.company_name as partner_name, p.status as partner_status
     from public.chauffeurs c
     left join public.partners p on p.id = c.partner_id
     where p.status is null or p.status in ('approved', 'active')
     order by case when c.status = 'available' then 0 else 1 end, c.full_name`,
  );
  res.json(result.rows);
});

app.get('/api/partner/trips', requireAuth, requireRole('partner'), async (req, res) => {
  if (!pool) return res.json([]);
  const partner = await findPartnerByOwner(req.user.sub);
  if (!partner) return res.status(404).json({ message: 'Partner profile not found.' });
  if (partner.status === 'suspended') {
    return res.status(403).json({ message: 'This partner account is suspended.' });
  }
  const result = await pool.query(
    `select r.*, c.full_name as chauffeur_name
     from public.partners p
     join public.chauffeurs c on c.partner_id = p.id
     join public.reservations r on r.assigned_chauffeur_id = c.id
     where p.owner_user_id = $1
     order by r.pickup_date asc, r.pickup_time asc`,
    [req.user.sub],
  );
  res.json(getPopulationSummary(result.rows));
});

app.get('/api/chauffeur/trips', requireAuth, requireRole('chauffeur'), async (req, res) => {
  if (!pool) return res.json([]);
  const result = await pool.query(
    `select r.*, c.full_name as chauffeur_name
     from public.chauffeurs c
     join public.reservations r on r.assigned_chauffeur_id = c.id
     where c.user_id = $1
     order by r.pickup_date asc, r.pickup_time asc`,
    [req.user.sub],
  );
  res.json(getPopulationSummary(result.rows));
});

app.patch('/api/chauffeur/trips/:reservationId/status', requireAuth, requireRole('chauffeur'), async (req, res) => {
  const { status: nextStatus } = req.body || {};
  if (!['in_transit', 'completed'].includes(nextStatus)) {
    return res.status(400).json({ message: 'Choose a supported trip status.' });
  }
  if (!pool) return res.status(503).json({ message: 'Trip status updates require PostgreSQL.' });

  const client = await pool.connect();
  try {
    await client.query('begin');
    const chauffeurResult = await client.query(
      'select id from public.chauffeurs where user_id = $1 for update',
      [req.user.sub],
    );
    if (!chauffeurResult.rowCount) {
      await client.query('rollback');
      return res.status(404).json({ message: 'Chauffeur profile not found.' });
    }

    const chauffeurId = chauffeurResult.rows[0].id;
    const reservationResult = await client.query(
      'select id, status from public.reservations where id = $1 and assigned_chauffeur_id = $2 for update',
      [req.params.reservationId, chauffeurId],
    );
    if (!reservationResult.rowCount) {
      await client.query('rollback');
      return res.status(404).json({ message: 'Assigned trip not found.' });
    }

    const currentStatus = reservationResult.rows[0].status;
    const expectedCurrentStatus = nextStatus === 'in_transit' ? 'assigned' : 'in_transit';
    if (currentStatus !== expectedCurrentStatus) {
      await client.query('rollback');
      return res.status(409).json({ message: `Trip must be ${expectedCurrentStatus} before it can become ${nextStatus}.` });
    }

    const updated = await client.query(
      'update public.reservations set status = $1 where id = $2 returning *',
      [nextStatus, req.params.reservationId],
    );
    if (nextStatus === 'completed') {
      await client.query("update public.chauffeurs set status = 'available' where id = $1", [chauffeurId]);
    }
    await client.query('commit');
    res.json({ message: 'Trip status updated.', reservation: getPopulationSummary(updated.rows)[0] });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/admin/overview', requireAuth, requireRole('admin'), async (req, res) => {
  const reservations = await listAllReservations();
  let availableVehicles = 0;
  let pendingPartners = 0;
  let activePartners = 0;

  if (pool) {
    const vehicleCount = await pool.query(
      `select count(*)::int as count
       from public.vehicles v
       join public.partners p on p.id = v.partner_id
       where v.status = 'available' and p.status in ('approved', 'active')`,
    );
    availableVehicles = vehicleCount.rows[0].count;
    const partnerStats = await pool.query(
      `select
         count(*) filter (where status in ('invited', 'approved'))::int as pending,
         count(*) filter (where status = 'active')::int as active
       from public.partners`,
    );
    pendingPartners = partnerStats.rows[0].pending;
    activePartners = partnerStats.rows[0].active;
  }

  res.json({
    reservationsToday: reservations.length,
    activeTrips: reservations.filter((item) => ['assigned', 'in_transit'].includes(item.status)).length,
    pendingApprovals: reservations.filter((item) => item.status === 'pending_confirmation').length,
    availableVehicles,
    pendingPartners,
    activePartners,
    revenue: reservations.reduce((total, item) => total + Number(item.quote_total || 0), 0),
  });
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  const errors = {};
  if (!String(email || '').trim()) errors.email = 'Enter the email associated with your account.';
  else if (!isValidEmail(normalizeEmail(email))) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  if (Object.keys(errors).length) {
    return validationError(res, 'Please correct the highlighted fields.', errors);
  }

  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);
  const passwordHash = user?.password_hash || user?.passwordHash;

  if (!user || user.is_active === false || !(await bcrypt.compare(String(password), passwordHash))) {
    return res.status(401).json({
      message: 'Invalid email or password.',
      errors: { password: 'Invalid email or password.' },
    });
  }

  const safeUser = sanitizeUser(user);
  setSessionCookie(res, safeUser);
  res.json({ user: safeUser });
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { name, email, password } = req.body;
  const errors = {};
  if (!String(name || '').trim()) errors.name = 'Enter your full name.';
  if (!String(email || '').trim()) errors.email = 'Enter your email address.';
  else if (!isValidEmail(normalizeEmail(email))) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Create a password.';
  else if (String(password).length < 8) errors.password = 'Use at least 8 characters for your password.';
  if (Object.keys(errors).length) {
    return validationError(res, 'Please correct the highlighted fields.', errors);
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    return res.status(409).json({
      message: 'An account with this email already exists.',
      errors: { email: 'An account with this email already exists.' },
    });
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

app.get('/api/address-suggest', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const mapboxToken = process.env.MAPBOX_TOKEN;
  if (!mapboxToken || mapboxToken.startsWith('replace-with')) {
    return res.json({
      providerConfigured: false,
      message: 'Address autocomplete is unavailable until an address provider token is configured. Manual entry remains supported.',
      suggestions: [],
    });
  }
  if (query.length < 3) {
    return res.json({ providerConfigured: true, suggestions: [] });
  }

  try {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
    url.searchParams.set('access_token', mapboxToken);
    url.searchParams.set('country', 'US');
    url.searchParams.set('types', 'address');
    url.searchParams.set('limit', '5');
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ providerConfigured: true, message: 'Address suggestions are temporarily unavailable.', suggestions: [] });
    }
    const data = await response.json();
    const suggestions = (data.features || []).map((feature) => {
      const context = feature.context || [];
      const region = context.find((item) => String(item.id).startsWith('region'))?.short_code?.replace(/^US-/, '') || '';
      const place = context.find((item) => String(item.id).startsWith('place'))?.text || '';
      const postcode = context.find((item) => String(item.id).startsWith('postcode'))?.text || '';
      return {
        label: feature.place_name,
        line1: feature.address ? `${feature.address} ${feature.text}` : feature.text,
        city: place,
        state: region,
        postal: postcode,
        verifiedByProvider: false,
      };
    }).filter((item) => SERVICE_AREA_STATES.includes(String(item.state || '').toUpperCase()));
    res.json({
      providerConfigured: true,
      suggestions,
      notice: 'Suggested addresses still require service-area validation and are not treated as fully geocoded confirmation.',
    });
  } catch {
    res.status(502).json({ providerConfigured: true, message: 'Address suggestions failed.', suggestions: [] });
  }
});

app.post('/api/quotes', async (req, res) => {
  const transfer = await validateTransfer(req.body || {});
  if (Object.keys(transfer.errors).length) {
    return validationError(res, 'Please complete a valid airport transfer route.', transfer.errors);
  }

  const fleetEntries = await listFleet();
  const category = fleetEntries.find(
    (item) => item.id === req.body?.vehicleId || item.category === req.body?.category,
  );
  if (!category) {
    return validationError(res, 'Select a valid vehicle category.', {
      category: 'Choose Business Class, First Class, or Luxury SUV.',
    });
  }
  const rideCounts = getRideCounts(req.body, category);
  if (rideCounts.error) {
    return validationError(res, rideCounts.error, { [rideCounts.field]: rideCounts.error });
  }

  const quote = getPaymentQuote(category, { quoteAirportCode: transfer.quoteAirportCode });
  res.json({
    category: category.category,
    passengers: rideCounts.passengers,
    luggage: rideCounts.luggage,
    transferType: transfer.transferType,
    quote,
  });
});

app.post('/api/reservations', async (req, res) => {
  const payload = req.body || {};
  const errors = {};
  if (!payload.date) errors.date = 'Choose a pickup date.';
  if (!payload.time) errors.time = 'Choose a pickup time.';
  if (!String(payload.name || '').trim()) errors.name = 'Enter the lead passenger name.';
  if (!String(payload.phone || '').trim()) errors.phone = 'Enter a mobile number for day-of coordination.';

  const transfer = await validateTransfer(payload);
  Object.assign(errors, transfer.errors);

  if (Object.keys(errors).length) {
    return validationError(res, 'Please complete the required booking details.', errors);
  }

  if (!isFuturePickup(payload.date, payload.time)) {
    return validationError(res, 'Choose a future pickup date and time.', {
      date: 'Pickup must be scheduled in the future.',
      time: 'Choose a pickup time later than now.',
    });
  }

  req.user = await authenticateRequest(req);
  if (!req.user) return res.status(401).json({ message: 'Authentication required or session expired.' });

  const categoryName = payload.vehicleCategory || payload.category || 'Business Class';
  const fleetEntries = await listFleet();
  const fleetEntry = fleetEntries.find((item) => item.category === categoryName || item.id === payload.vehicleId);
  if (!fleetEntry) {
    return validationError(res, 'Select a valid vehicle category.', {
      category: 'Choose Business Class, First Class, or Luxury SUV.',
    });
  }
  const rideCounts = getRideCounts(payload, fleetEntry);
  if (rideCounts.error) {
    return validationError(res, rideCounts.error, { [rideCounts.field]: rideCounts.error });
  }
  const quote = getPaymentQuote(fleetEntry, { quoteAirportCode: transfer.quoteAirportCode });

  const pickupLabel = formatEndpointLabel({
    airportCode: transfer.pickupAirportCode,
    ...transfer.pickupAddress,
  });
  const destinationLabel = formatEndpointLabel({
    airportCode: transfer.destinationAirportCode,
    ...transfer.destinationAddress,
  });

  const reservation = {
    id: `res-${randomUUID().slice(0, 8)}`,
    customer_id: req.user.sub,
    customer_name: payload.name,
    customer_email: req.user.email,
    customer_phone: String(payload.phone || '').trim(),
    passenger_count: rideCounts.passengers,
    luggage_count: rideCounts.luggage,
    transfer_type: transfer.transferType,
    pickup_airport_code: transfer.pickupAirportCode,
    destination_airport_code: transfer.destinationAirportCode,
    pickup_address_line1: transfer.pickupAddress.line1 || null,
    pickup_address_line2: transfer.pickupAddress.line2 || null,
    pickup_city: transfer.pickupAddress.city || null,
    pickup_state: transfer.pickupAddress.state || null,
    pickup_postal: transfer.pickupAddress.postal || null,
    destination_address_line1: transfer.destinationAddress.line1 || null,
    destination_address_line2: transfer.destinationAddress.line2 || null,
    destination_city: transfer.destinationAddress.city || null,
    destination_state: transfer.destinationAddress.state || null,
    destination_postal: transfer.destinationAddress.postal || null,
    address_verified: false,
    pickup_date: payload.date,
    pickup_time: payload.time,
    flight_number: payload.flightNumber || payload.flight_number || '',
    vehicle_category: fleetEntry.category,
    quote_total: quote.total,
    total: quote.total,
    pickup: pickupLabel,
    destination: destinationLabel,
    transferType: transfer.transferType,
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
          customer_phone,
          passenger_count,
          luggage_count,
          transfer_type,
          pickup_airport_code,
          destination_airport_code,
          pickup_address_line1,
          pickup_address_line2,
          pickup_city,
          pickup_state,
          pickup_postal,
          destination_address_line1,
          destination_address_line2,
          destination_city,
          destination_state,
          destination_postal,
          address_verified,
          pickup_date,
          pickup_time,
          flight_number,
          vehicle_category,
          quote_total,
          status,
          notes
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27
        )
        returning *
      `,
      [
        req.user.sub,
        reservation.customer_name,
        reservation.customer_email,
        reservation.customer_phone,
        reservation.passenger_count,
        reservation.luggage_count,
        reservation.transfer_type,
        reservation.pickup_airport_code,
        reservation.destination_airport_code,
        reservation.pickup_address_line1,
        reservation.pickup_address_line2,
        reservation.pickup_city,
        reservation.pickup_state,
        reservation.pickup_postal,
        reservation.destination_address_line1,
        reservation.destination_address_line2,
        reservation.destination_city,
        reservation.destination_state,
        reservation.destination_postal,
        reservation.address_verified,
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
    reservation: getPopulationSummary([reservation])[0],
    quote,
  });
});

app.post('/api/admin/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { reservationId, chauffeurId } = req.body || {};
  if (!reservationId || !chauffeurId) {
    return res.status(400).json({ message: 'Reservation and chauffeur are required.' });
  }
  if (!pool) {
    return res.status(503).json({ message: 'Chauffeur assignment requires PostgreSQL.' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const reservationResult = await client.query(
      'select id, status, assigned_chauffeur_id from public.reservations where id = $1 for update',
      [reservationId],
    );
    if (!reservationResult.rowCount) {
      await client.query('rollback');
      return res.status(404).json({ message: 'Reservation not found.' });
    }

    const reservation = reservationResult.rows[0];
    if (['cancelled', 'completed', 'in_transit'].includes(reservation.status)) {
      await client.query('rollback');
      return res.status(409).json({ message: 'This reservation can no longer be assigned.' });
    }

    const chauffeurResult = await client.query(
      `select c.id, c.full_name, c.status, p.status as partner_status
       from public.chauffeurs c
       left join public.partners p on p.id = c.partner_id
       where c.id = $1
       for update of c`,
      [chauffeurId],
    );
    if (!chauffeurResult.rowCount) {
      await client.query('rollback');
      return res.status(404).json({ message: 'Chauffeur not found.' });
    }

    const chauffeur = chauffeurResult.rows[0];
    if (chauffeur.partner_status && !['approved', 'active'].includes(chauffeur.partner_status)) {
      await client.query('rollback');
      return res.status(409).json({ message: 'Chauffeur belongs to a partner that is not active.' });
    }
    const isCurrentAssignment = reservation.assigned_chauffeur_id === chauffeur.id;
    if (chauffeur.status !== 'available' && !isCurrentAssignment) {
      await client.query('rollback');
      return res.status(409).json({ message: 'Chauffeur is not available.' });
    }

    if (reservation.assigned_chauffeur_id && !isCurrentAssignment) {
      await client.query(
        "update public.chauffeurs set status = 'available' where id = $1",
        [reservation.assigned_chauffeur_id],
      );
    }
    await client.query(
      "update public.chauffeurs set status = 'assigned' where id = $1",
      [chauffeur.id],
    );
    const updated = await client.query(
      `update public.reservations
       set assigned_chauffeur_id = $1, status = 'assigned', assigned_at = now()
       where id = $2 returning *`,
      [chauffeur.id, reservationId],
    );
    await client.query('commit');
    res.json({
      message: 'Chauffeur assigned.',
      reservation: { ...updated.rows[0], chauffeur_name: chauffeur.full_name },
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/admin/partners', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Partner management requires PostgreSQL.' });
  const result = await pool.query(
    `select p.*,
            u.name as owner_name,
            u.email as owner_email,
            (select count(*)::int from public.chauffeurs c where c.partner_id = p.id) as chauffeur_count,
            (select count(*)::int from public.vehicles v where v.partner_id = p.id) as vehicle_count
     from public.partners p
     left join public.users u on u.id = p.owner_user_id
     order by p.created_at desc`,
  );
  res.json(result.rows.map(serializePartner));
});

app.get('/api/admin/partner-invitations', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Partner invitations require PostgreSQL.' });
  const result = await pool.query(
    `select id, company_name, contact_email, expires_at, used_at, revoked_at, partner_id, created_at
     from public.partner_invitations
     order by created_at desc
     limit 50`,
  );
  res.json(result.rows.map((row) => serializeInvitation(row)));
});

app.post('/api/admin/partners/invite', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Partner invitations require PostgreSQL.' });

  const companyName = String(req.body?.companyName || '').trim();
  const contactEmail = normalizeEmail(req.body?.contactEmail || req.body?.email);
  const errors = {};
  if (!companyName) errors.companyName = 'Enter the transportation company name.';
  if (!contactEmail) errors.contactEmail = 'Enter the partner contact email.';
  else if (!isValidEmail(contactEmail)) errors.contactEmail = 'Enter a valid contact email.';
  if (Object.keys(errors).length) {
    return validationError(res, 'Company name and a valid contact email are required.', errors);
  }

  const existingUser = await findUserByEmail(contactEmail);
  if (existingUser) {
    return res.status(409).json({
      message: 'An account with this email already exists.',
      errors: { contactEmail: 'An account with this email already exists.' },
    });
  }

  const openInvite = await pool.query(
    `select id from public.partner_invitations
     where contact_email = $1 and used_at is null and revoked_at is null and expires_at > now()`,
    [contactEmail],
  );
  if (openInvite.rowCount) {
    return res.status(409).json({
      message: 'An open invitation already exists for this email.',
      errors: { contactEmail: 'An open invitation already exists for this email.' },
    });
  }

  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const partnerInsert = await client.query(
      `insert into public.partners (company_name, contact_email, status)
       values ($1, $2, 'invited')
       returning *`,
      [companyName, contactEmail],
    );
    const inviteInsert = await client.query(
      `insert into public.partner_invitations
         (company_name, contact_email, token_hash, invited_by, expires_at, partner_id)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [companyName, contactEmail, tokenHash, req.user.sub, expiresAt.toISOString(), partnerInsert.rows[0].id],
    );
    await client.query('commit');
    res.status(201).json({
      message: 'Partner invitation created.',
      invitation: serializeInvitation(inviteInsert.rows[0], { includeToken: true, token }),
      partner: serializePartner(partnerInsert.rows[0]),
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});

app.patch('/api/admin/partners/:partnerId', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Partner management requires PostgreSQL.' });
  const nextStatus = String(req.body?.status || '').trim().toLowerCase();
  if (!['approved', 'active', 'suspended'].includes(nextStatus)) {
    return res.status(400).json({ message: 'Status must be approved, active, or suspended.' });
  }

  const result = await pool.query(
    `update public.partners
     set status = $1
     where id = $2
     returning *`,
    [nextStatus, req.params.partnerId],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Partner not found.' });
  res.json({ message: `Partner marked ${nextStatus}.`, partner: serializePartner(result.rows[0]) });
});

app.get('/api/admin/vehicles', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Fleet records require PostgreSQL.' });
  const result = await pool.query(
    `select v.*, p.company_name as partner_name, p.status as partner_status
     from public.vehicles v
     join public.partners p on p.id = v.partner_id
     order by v.created_at desc`,
  );
  res.json(result.rows.map((row) => ({ ...serializeVehicle(row), partnerName: row.partner_name, partnerStatus: row.partner_status })));
});

app.get('/api/partner/invitations/:token', async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Partner invitations require PostgreSQL.' });
  const tokenHash = hashInvitationToken(req.params.token);
  const result = await pool.query(
    `select id, company_name, contact_email, expires_at, used_at, revoked_at, partner_id, created_at
     from public.partner_invitations
     where token_hash = $1`,
    [tokenHash],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Invitation not found.' });
  const invitation = serializeInvitation(result.rows[0]);
  if (invitation.status !== 'pending') {
    return res.status(410).json({ message: `This invitation is ${invitation.status}.`, invitation });
  }
  res.json({ invitation });
});

app.post('/api/partner/accept-invitation', authRateLimit, async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Partner invitations require PostgreSQL.' });

  const token = String(req.body?.token || '').trim();
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  const errors = {};
  if (!token) errors.form = 'Invitation token is missing.';
  if (!name) errors.name = 'Enter your full name.';
  if (!password) errors.password = 'Create a password.';
  else if (password.length < 8) errors.password = 'Use at least 8 characters for your password.';
  if (Object.keys(errors).length) {
    return validationError(res, 'Invitation token, name, and a password with at least 8 characters are required.', errors);
  }

  const tokenHash = hashInvitationToken(token);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const inviteResult = await client.query(
      `select * from public.partner_invitations
       where token_hash = $1
       for update`,
      [tokenHash],
    );
    if (!inviteResult.rowCount) {
      await client.query('rollback');
      return res.status(404).json({ message: 'Invitation not found.' });
    }

    const invitation = inviteResult.rows[0];
    if (invitation.revoked_at) {
      await client.query('rollback');
      return res.status(410).json({ message: 'This invitation has been revoked.' });
    }
    if (invitation.used_at) {
      await client.query('rollback');
      return res.status(410).json({ message: 'This invitation has already been used.' });
    }
    if (new Date(invitation.expires_at) < new Date()) {
      await client.query('rollback');
      return res.status(410).json({ message: 'This invitation has expired.' });
    }

    const existing = await client.query(
      'select id from public.users where email = $1',
      [invitation.contact_email],
    );
    if (existing.rowCount) {
      await client.query('rollback');
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userInsert = await client.query(
      `insert into public.users (name, email, password_hash, role)
       values ($1, $2, $3, 'partner')
       returning id, name, email, role`,
      [name, invitation.contact_email, passwordHash],
    );
    const user = userInsert.rows[0];

    let partner;
    if (invitation.partner_id) {
      const partnerUpdate = await client.query(
        `update public.partners
         set owner_user_id = $1, company_name = $2, contact_email = $3, status = 'approved'
         where id = $4
         returning *`,
        [user.id, invitation.company_name, invitation.contact_email, invitation.partner_id],
      );
      partner = partnerUpdate.rows[0];
    } else {
      const partnerInsert = await client.query(
        `insert into public.partners (owner_user_id, company_name, contact_email, status)
         values ($1, $2, $3, 'approved')
         returning *`,
        [user.id, invitation.company_name, invitation.contact_email],
      );
      partner = partnerInsert.rows[0];
    }

    await client.query(
      `update public.partner_invitations
       set used_at = now(), partner_id = $1
       where id = $2`,
      [partner.id, invitation.id],
    );
    await client.query('commit');

    const safeUser = sanitizeUser(user);
    setSessionCookie(res, safeUser);
    res.status(201).json({
      message: 'Partner account created. An administrator will activate fleet operations.',
      user: safeUser,
      partner: serializePartner(partner),
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/partner/profile', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  res.json({ partner: serializePartner(req.partner) });
});

app.patch('/api/partner/profile', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  const companyName = String(req.body?.companyName ?? req.partner.company_name).trim();
  const phone = String(req.body?.phone ?? req.partner.phone ?? '').trim();
  const address = String(req.body?.address ?? req.partner.address ?? '').trim();
  const notes = String(req.body?.notes ?? req.partner.notes ?? '').trim();
  if (!companyName) return res.status(400).json({ message: 'Company name is required.' });

  const result = await pool.query(
    `update public.partners
     set company_name = $1, phone = $2, address = $3, notes = $4
     where id = $5
     returning *`,
    [companyName, phone || null, address || null, notes || null, req.partner.id],
  );
  res.json({ message: 'Partner profile updated.', partner: serializePartner(result.rows[0]) });
});

app.get('/api/partner/chauffeurs', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  const result = await pool.query(
    `select c.id, c.full_name, c.phone, c.status, c.created_at, u.email
     from public.chauffeurs c
     left join public.users u on u.id = c.user_id
     where c.partner_id = $1
     order by c.full_name`,
    [req.partner.id],
  );
  res.json(result.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    status: row.status,
    email: row.email,
    createdAt: row.created_at,
  })));
});

app.post('/api/partner/chauffeurs', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  if (req.partner.status !== 'active') {
    return res.status(403).json({ message: 'Partner must be active before managing chauffeurs.' });
  }

  const fullName = String(req.body?.fullName || req.body?.name || '').trim();
  const email = normalizeEmail(req.body?.email);
  const phone = String(req.body?.phone || '').trim();
  const password = String(req.body?.password || '');
  const errors = {};
  if (!fullName) errors.fullName = 'Enter the chauffeur full name.';
  if (!email) errors.email = 'Enter the chauffeur email.';
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Create a temporary password.';
  else if (password.length < 8) errors.password = 'Use at least 8 characters for the temporary password.';
  if (Object.keys(errors).length) {
    return validationError(res, 'Chauffeur name, email, and a password with at least 8 characters are required.', errors);
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({
      message: 'An account with this email already exists.',
      errors: { email: 'An account with this email already exists.' },
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const userInsert = await client.query(
      `insert into public.users (name, email, password_hash, role)
       values ($1, $2, $3, 'chauffeur')
       returning id, name, email, role`,
      [fullName, email, passwordHash],
    );
    const chauffeurInsert = await client.query(
      `insert into public.chauffeurs (user_id, partner_id, full_name, phone, status)
       values ($1, $2, $3, $4, 'available')
       returning *`,
      [userInsert.rows[0].id, req.partner.id, fullName, phone || null],
    );
    await client.query('commit');
    res.status(201).json({
      message: 'Chauffeur added to your roster.',
      chauffeur: {
        id: chauffeurInsert.rows[0].id,
        fullName: chauffeurInsert.rows[0].full_name,
        phone: chauffeurInsert.rows[0].phone,
        status: chauffeurInsert.rows[0].status,
        email,
      },
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});

app.patch('/api/partner/chauffeurs/:chauffeurId', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  if (req.partner.status !== 'active') {
    return res.status(403).json({ message: 'Partner must be active before managing chauffeurs.' });
  }

  const nextStatus = String(req.body?.status || '').trim().toLowerCase();
  if (!['available', 'offline'].includes(nextStatus)) {
    return res.status(400).json({ message: 'Status must be available or offline.' });
  }

  const existing = await pool.query(
    'select id, status from public.chauffeurs where id = $1 and partner_id = $2',
    [req.params.chauffeurId, req.partner.id],
  );
  if (!existing.rowCount) return res.status(404).json({ message: 'Chauffeur not found for this partner.' });
  if (existing.rows[0].status === 'assigned' && nextStatus === 'offline') {
    return res.status(409).json({ message: 'Assigned chauffeurs cannot be taken offline until the trip completes.' });
  }

  const updated = await pool.query(
    `update public.chauffeurs
     set status = $1, full_name = coalesce(nullif($2, ''), full_name), phone = coalesce($3, phone)
     where id = $4 and partner_id = $5
     returning *`,
    [
      nextStatus,
      String(req.body?.fullName || '').trim(),
      req.body?.phone === undefined ? null : String(req.body.phone).trim() || null,
      req.params.chauffeurId,
      req.partner.id,
    ],
  );
  res.json({
    message: 'Chauffeur updated.',
    chauffeur: {
      id: updated.rows[0].id,
      fullName: updated.rows[0].full_name,
      phone: updated.rows[0].phone,
      status: updated.rows[0].status,
    },
  });
});

app.get('/api/partner/vehicles', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  const result = await pool.query(
    'select * from public.vehicles where partner_id = $1 order by created_at desc',
    [req.partner.id],
  );
  res.json(result.rows.map(serializeVehicle));
});

app.post('/api/partner/vehicles', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  if (req.partner.status !== 'active') {
    return res.status(403).json({ message: 'Partner must be active before managing vehicles.' });
  }

  const categorySlug = resolveCategorySlug(req.body?.categorySlug || req.body?.category);
  if (!categorySlug) {
    return res.status(400).json({
      message: 'Vehicle category must be Business Class, First Class, or Luxury SUV.',
    });
  }

  const meta = ALLOWED_FLEET_CATEGORIES[categorySlug];
  const makeModel = String(req.body?.makeModel || meta.defaultMakeModel).trim();
  const licensePlate = String(req.body?.licensePlate || '').trim().toUpperCase();
  const color = String(req.body?.color || '').trim();
  const year = req.body?.year === undefined || req.body?.year === '' ? null : Number(req.body.year);
  const seats = Number(req.body?.seats ?? meta.seats);
  const luggage = Number(req.body?.luggage ?? meta.luggage);
  const errors = {};

  if (!makeModel) errors.makeModel = 'Enter the vehicle make and model.';
  else if (isBannedVehicleModel(makeModel)) {
    errors.makeModel = 'Infiniti QX80 is not an accepted vehicle model. Use Cadillac Escalade or Similar for Luxury SUV.';
  }
  if (!licensePlate) errors.licensePlate = 'Enter the license plate.';
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
    errors.seats = 'Seats must be an integer between 1 and 8.';
  }
  if (!Number.isInteger(luggage) || luggage < 0 || luggage > 12) {
    errors.luggage = 'Luggage capacity must be an integer between 0 and 12.';
  }
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    errors.year = 'Enter a valid vehicle year.';
  }
  if (Object.keys(errors).length) {
    return validationError(res, 'Please correct the vehicle details.', errors);
  }

  try {
    const insert = await pool.query(
      `insert into public.vehicles
         (partner_id, category_slug, make_model, license_plate, color, year, seats, luggage, status, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'available', $9)
       returning *`,
      [
        req.partner.id,
        categorySlug,
        makeModel,
        licensePlate,
        color || null,
        year,
        seats,
        luggage,
        String(req.body?.notes || '').trim() || null,
      ],
    );
    res.status(201).json({ message: 'Vehicle added to your fleet.', vehicle: serializeVehicle(insert.rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A vehicle with this license plate already exists for your company.',
        errors: { licensePlate: 'A vehicle with this license plate already exists for your company.' },
      });
    }
    throw error;
  }
});

app.patch('/api/partner/vehicles/:vehicleId', requireAuth, requireRole('partner'), requireActivePartner, async (req, res) => {
  if (req.partner.status !== 'active') {
    return res.status(403).json({ message: 'Partner must be active before managing vehicles.' });
  }

  const existing = await pool.query(
    'select * from public.vehicles where id = $1 and partner_id = $2',
    [req.params.vehicleId, req.partner.id],
  );
  if (!existing.rowCount) return res.status(404).json({ message: 'Vehicle not found for this partner.' });

  const current = existing.rows[0];
  const nextStatus = req.body?.status === undefined
    ? current.status
    : String(req.body.status).trim().toLowerCase();
  if (!['available', 'maintenance', 'inactive'].includes(nextStatus)) {
    return res.status(400).json({ message: 'Status must be available, maintenance, or inactive.' });
  }

  const categorySlug = req.body?.categorySlug || req.body?.category
    ? resolveCategorySlug(req.body.categorySlug || req.body.category)
    : current.category_slug;
  if (!categorySlug) {
    return res.status(400).json({ message: 'Vehicle category must be Business Class, First Class, or Luxury SUV.' });
  }

  const makeModel = String(req.body?.makeModel ?? current.make_model).trim();
  const licensePlate = String(req.body?.licensePlate ?? current.license_plate).trim().toUpperCase();
  const color = req.body?.color === undefined ? current.color : String(req.body.color).trim() || null;
  const year = req.body?.year === undefined
    ? current.year
    : (req.body.year === '' || req.body.year === null ? null : Number(req.body.year));
  const seats = Number(req.body?.seats ?? current.seats);
  const luggage = Number(req.body?.luggage ?? current.luggage);
  const notes = req.body?.notes === undefined ? current.notes : String(req.body.notes).trim() || null;
  const errors = {};

  if (!makeModel) errors.makeModel = 'Enter the vehicle make and model.';
  else if (isBannedVehicleModel(makeModel)) {
    errors.makeModel = 'Infiniti QX80 is not an accepted vehicle model. Use Cadillac Escalade or Similar for Luxury SUV.';
  }
  if (!licensePlate) errors.licensePlate = 'Enter the license plate.';
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
    errors.seats = 'Seats must be an integer between 1 and 8.';
  }
  if (!Number.isInteger(luggage) || luggage < 0 || luggage > 12) {
    errors.luggage = 'Luggage capacity must be an integer between 0 and 12.';
  }
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    errors.year = 'Enter a valid vehicle year.';
  }
  if (Object.keys(errors).length) {
    return validationError(res, 'Please correct the vehicle details.', errors);
  }

  try {
    const updated = await pool.query(
      `update public.vehicles
       set category_slug = $1,
           make_model = $2,
           license_plate = $3,
           color = $4,
           year = $5,
           seats = $6,
           luggage = $7,
           status = $8,
           notes = $9
       where id = $10 and partner_id = $11
       returning *`,
      [categorySlug, makeModel, licensePlate, color, year, seats, luggage, nextStatus, notes, req.params.vehicleId, req.partner.id],
    );
    res.json({ message: 'Vehicle updated.', vehicle: serializeVehicle(updated.rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A vehicle with this license plate already exists for your company.' });
    }
    throw error;
  }
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

export { app, initializeDatabase, pool };
