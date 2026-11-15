import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import EmbeddedPostgres from 'embedded-postgres';

let postgres;
let databasePool;
let app;
let adminCookie;
let customerCookie;
let partnerCookie;
let chauffeurCookie;
let customerId;
let reservationId;
let chauffeurId;

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  const port = await getAvailablePort();
  postgres = new EmbeddedPostgres({
    databaseDir: path.join(os.tmpdir(), `aurelia-postgres-${process.pid}-${randomUUID()}`),
    user: 'postgres',
    password: 'aurelia-test-password',
    port,
    persistent: false,
    autoRehydrateSymlinks: true,
    onLog: () => {},
    onError: () => {},
  });

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('aurelia_test');

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'aurelia-integration-test-secret-32-characters';
  process.env.DATABASE_URL = `postgresql://postgres:aurelia-test-password@127.0.0.1:${port}/aurelia_test`;
  process.env.DATABASE_SSL = 'false';

  const api = await import('../index.js');
  app = api.app;
  databasePool = api.pool;
  await api.initializeDatabase();
  await api.initializeDatabase();

  const adminPassword = 'IntegrationAdmin!42';
  const adminHash = await bcrypt.hash(adminPassword, 10);
  await databasePool.query(
    `insert into public.users (name, email, password_hash, role)
     values ('Integration Admin', 'admin@integration.test', $1, 'admin')`,
    [adminHash],
  );
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@integration.test', password: adminPassword });
  assert.equal(adminLogin.status, 200);
  adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];

  const partnerPassword = 'IntegrationPartner!42';
  const partnerHash = await bcrypt.hash(partnerPassword, 10);
  const partnerUser = await databasePool.query(
    `insert into public.users (name, email, password_hash, role)
     values ('Integration Partner', 'partner@integration.test', $1, 'partner')
     returning id`,
    [partnerHash],
  );
  const partner = await databasePool.query(
    `insert into public.partners (owner_user_id, company_name, status)
     values ($1, 'Integration Fleet', 'active')
     returning id`,
    [partnerUser.rows[0].id],
  );
  const partnerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'partner@integration.test', password: partnerPassword });
  assert.equal(partnerLogin.status, 200);
  partnerCookie = partnerLogin.headers['set-cookie'][0].split(';')[0];

  const customerRegistration = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Database Passenger',
      email: `passenger-${randomUUID()}@integration.test`,
      password: 'PassengerPass!42',
    });
  assert.equal(customerRegistration.status, 201);
  customerId = customerRegistration.body.user.id;
  customerCookie = customerRegistration.headers['set-cookie'][0].split(';')[0];

  const chauffeurUser = await databasePool.query(
    `insert into public.users (name, email, password_hash, role)
     values ('Integration Chauffeur', $1, $2, 'chauffeur')
     returning id, email`,
    [`chauffeur-${randomUUID()}@integration.test`, await bcrypt.hash('ChauffeurPass!42', 10)],
  );
  const chauffeur = await databasePool.query(
    `insert into public.chauffeurs (user_id, partner_id, full_name, phone)
     values ($1, $2, 'Jordan Driver', '+1-555-0101')
     returning id`,
    [chauffeurUser.rows[0].id, partner.rows[0].id],
  );
  chauffeurId = chauffeur.rows[0].id;
  const chauffeurLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: chauffeurUser.rows[0].email, password: 'ChauffeurPass!42' });
  assert.equal(chauffeurLogin.status, 200);
  chauffeurCookie = chauffeurLogin.headers['set-cookie'][0].split(';')[0];
});

after(async () => {
  if (databasePool) await databasePool.end();
  if (postgres) await postgres.stop();
});

test('PostgreSQL migrations are tracked and safe to rerun', async () => {
  const migrations = await databasePool.query(
    'select name from public.schema_migrations order by name',
  );

  assert.deepEqual(migrations.rows.map((row) => row.name), [
    '001_init.sql',
    '002_seed.sql',
    '003_reservation_chauffeur_assignment.sql',
  ]);

  const airports = await databasePool.query('select count(*)::int as count from public.airports');
  assert.equal(airports.rows[0].count, 9);
});

test('PostgreSQL persists customer bookings and atomic chauffeur assignment', async () => {
  const created = await request(app)
    .post('/api/reservations')
    .set('Cookie', customerCookie)
    .send({
      name: 'Database Passenger',
      pickup: 'EWR',
      destination: 'JFK',
      date: '2026-12-29',
      time: '19:15',
      vehicleCategory: 'First Class',
    });

  assert.equal(created.status, 201);
  assert.equal(created.body.reservation.status, 'pending_confirmation');
  reservationId = created.body.reservation.id;

  const listed = await request(app)
    .get('/api/my-reservations')
    .set('Cookie', customerCookie);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].customer_id, customerId);
  assert.equal(listed.body[0].id, reservationId);

  const beforeAssignment = await databasePool.query(
    'select customer_id, status, assigned_chauffeur_id from public.reservations where id = $1',
    [reservationId],
  );
  assert.equal(beforeAssignment.rows[0].customer_id, customerId);
  assert.equal(beforeAssignment.rows[0].assigned_chauffeur_id, null);
  assert.equal(beforeAssignment.rows[0].status, 'pending_confirmation');

  const assignment = await request(app)
    .post('/api/admin/assign')
    .set('Cookie', adminCookie)
    .send({ reservationId, chauffeurId });
  assert.equal(assignment.status, 200);
  assert.equal(assignment.body.reservation.assigned_chauffeur_id, chauffeurId);
  assert.equal(assignment.body.reservation.chauffeur_name, 'Jordan Driver');

  const persisted = await databasePool.query(
    `select r.status, r.assigned_chauffeur_id, r.assigned_at, c.status as chauffeur_status
     from public.reservations r
     join public.chauffeurs c on c.id = r.assigned_chauffeur_id
     where r.id = $1`,
    [reservationId],
  );
  assert.equal(persisted.rows[0].status, 'assigned');
  assert.equal(persisted.rows[0].assigned_chauffeur_id, chauffeurId);
  assert.equal(persisted.rows[0].chauffeur_status, 'assigned');
  assert.ok(persisted.rows[0].assigned_at);

  const adminReservations = await request(app)
    .get('/api/admin/reservations')
    .set('Cookie', adminCookie);
  assert.equal(adminReservations.status, 200);
  assert.equal(adminReservations.body[0].chauffeur_name, 'Jordan Driver');
});

test('partner and chauffeur portals are scoped to assigned operational records', async () => {
  const partnerTrips = await request(app)
    .get('/api/partner/trips')
    .set('Cookie', partnerCookie);
  assert.equal(partnerTrips.status, 200);
  assert.equal(partnerTrips.body.length, 1);
  assert.equal(partnerTrips.body[0].id, reservationId);

  const chauffeurTrips = await request(app)
    .get('/api/chauffeur/trips')
    .set('Cookie', chauffeurCookie);
  assert.equal(chauffeurTrips.status, 200);
  assert.equal(chauffeurTrips.body.length, 1);
  assert.equal(chauffeurTrips.body[0].id, reservationId);

  const started = await request(app)
    .patch(`/api/chauffeur/trips/${reservationId}/status`)
    .set('Cookie', chauffeurCookie)
    .send({ status: 'in_transit' });
  assert.equal(started.status, 200);
  assert.equal(started.body.reservation.status, 'in_transit');

  const completed = await request(app)
    .patch(`/api/chauffeur/trips/${reservationId}/status`)
    .set('Cookie', chauffeurCookie)
    .send({ status: 'completed' });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.reservation.status, 'completed');

  const chauffeurState = await databasePool.query(
    'select status from public.chauffeurs where id = $1',
    [chauffeurId],
  );
  assert.equal(chauffeurState.rows[0].status, 'available');
});
