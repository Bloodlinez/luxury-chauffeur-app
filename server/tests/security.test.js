import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../index.js';

const fromAirportPayload = {
  transferType: 'from_airport',
  pickupAirport: 'EWR',
  destinationAddressLine1: '1 World Trade Center',
  destinationCity: 'New York',
  destinationState: 'NY',
  destinationPostal: '10007',
};

test('forbidden from-airport pickup outside New Jersey is rejected', async () => {
  const response = await request(app)
    .post('/api/reservations')
    .send({
      name: 'Blocked User',
      transferType: 'from_airport',
      pickupAirport: 'JFK',
      destinationAddressLine1: '500 Boardwalk',
      destinationCity: 'Atlantic City',
      destinationState: 'NJ',
      destinationPostal: '08401',
      date: '2026-12-20',
      time: '18:00',
      phone: '+1-555-0199',
      vehicleCategory: 'Business Class',
      email: 'blocked@example.com',
    });

  assert.equal(response.status, 400);
  assert.ok(response.body.errors.pickupAirport || response.body.errors.transferType);
});

test('auth and reservation validation return field-level errors', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: '', password: '' });
  assert.equal(login.status, 400);
  assert.equal(login.body.errors.email, 'Enter the email associated with your account.');
  assert.equal(login.body.errors.password, 'Enter your password.');

  const register = await request(app)
    .post('/api/auth/register')
    .send({ name: '', email: 'bad', password: 'short' });
  assert.equal(register.status, 400);
  assert.ok(register.body.errors.name);
  assert.ok(register.body.errors.email);
  assert.ok(register.body.errors.password);
});

test('admin data is not available without an authenticated admin session', async () => {
  const response = await request(app).get('/api/admin/overview');

  assert.equal(response.status, 401);
});

test('partner invitation endpoints reject unauthenticated admin actions', async () => {
  const invite = await request(app)
    .post('/api/admin/partners/invite')
    .send({ companyName: 'Unauthorized Fleet', contactEmail: 'unauthorized@example.com' });
  assert.equal(invite.status, 401);

  const partners = await request(app).get('/api/admin/partners');
  assert.equal(partners.status, 401);
});

test('server quote validates transfer capacity and returns authoritative pricing', async () => {
  const quote = await request(app)
    .post('/api/quotes')
    .send({ ...fromAirportPayload, vehicleId: 'first-class', passengers: 2, luggage: 2 });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.category, 'First Class');
  assert.equal(quote.body.quote.total, 369.8);

  const forbidden = await request(app)
    .post('/api/quotes')
    .send({
      transferType: 'from_airport',
      pickupAirport: 'JFK',
      destinationAddressLine1: '10 Main St',
      destinationCity: 'Newark',
      destinationState: 'NJ',
      destinationPostal: '07102',
      vehicleId: 'first-class',
    });
  assert.equal(forbidden.status, 400);

  const overCapacity = await request(app)
    .post('/api/quotes')
    .send({ ...fromAirportPayload, vehicleId: 'first-class', passengers: 5 });
  assert.equal(overCapacity.status, 400);
  assert.ok(overCapacity.body.errors.passengers);

  const decimalRejected = await request(app)
    .post('/api/quotes')
    .send({ ...fromAirportPayload, vehicleId: 'business-class', passengers: '2.5', luggage: 1 });
  assert.equal(decimalRejected.status, 400);
});

test('secure registration and server-generated quote produce pending confirmation status', async () => {
  const register = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test Passenger',
      email: `test-${Date.now()}@example.com`,
      password: 'SecurePass!23',
    });

  assert.equal(register.status, 201);
  const sessionCookie = register.headers['set-cookie']?.[0]?.split(';')[0];
  assert.ok(sessionCookie);
  assert.equal(register.body.token, undefined);

  const reservation = await request(app)
    .post('/api/reservations')
    .set('Cookie', sessionCookie)
    .send({
      name: 'Test Passenger',
      ...fromAirportPayload,
      date: '2026-12-21',
      time: '18:30',
      phone: '+1-555-0100',
      email: register.body.user.email,
      vehicleCategory: 'First Class',
      passengers: 2,
      luggage: 1,
      total: 1,
    });

  assert.equal(reservation.status, 201);
  assert.equal(reservation.body.reservation.status, 'pending_confirmation');
  assert.equal(reservation.body.reservation.transferType, 'from_airport');
  assert.ok(reservation.body.quote.total > 0);
  assert.equal(reservation.body.reservation.total, reservation.body.quote.total);
  assert.ok(reservation.body.reservation.total > 1);
  const quote = await request(app)
    .post('/api/quotes')
    .send({ ...fromAirportPayload, vehicleId: 'first-class', passengers: 2, luggage: 1 });
  assert.equal(quote.body.quote.total, reservation.body.quote.total);

  const myReservations = await request(app)
    .get('/api/my-reservations')
    .set('Cookie', sessionCookie);

  assert.equal(myReservations.status, 200);
  assert.equal(myReservations.body.length, 1);
  assert.equal(myReservations.body[0].customer_id, register.body.user.id);
  assert.match(String(myReservations.body[0].destination), /World Trade/i);
});
