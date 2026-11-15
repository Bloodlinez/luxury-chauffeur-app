import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../index.js';

test('forbidden route is rejected under launch geography policy', async () => {
  const response = await request(app)
    .post('/api/reservations')
    .send({
      name: 'Blocked User',
      pickup: 'JFK',
      destination: 'LGA',
      date: '2026-12-20',
      time: '18:00',
      vehicleCategory: 'Business Class',
      email: 'blocked@example.com',
    });

  assert.equal(response.status, 400);
  assert.match(String(response.body.message), /not available|launch policy/i);
});

test('admin data is not available without an authenticated admin session', async () => {
  const response = await request(app).get('/api/admin/overview');

  assert.equal(response.status, 401);
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
      pickup: 'EWR',
      destination: 'JFK',
      date: '2026-12-21',
      time: '18:30',
      email: register.body.user.email,
      vehicleCategory: 'First Class',
      total: 1,
    });

  assert.equal(reservation.status, 201);
  assert.equal(reservation.body.reservation.status, 'pending_confirmation');
  assert.ok(reservation.body.quote.total > 0);
  assert.equal(reservation.body.reservation.total, reservation.body.quote.total);
  assert.ok(reservation.body.reservation.total > 1);

  const myReservations = await request(app)
    .get('/api/my-reservations')
    .set('Cookie', sessionCookie);

  assert.equal(myReservations.status, 200);
  assert.equal(myReservations.body.length, 1);
  assert.equal(myReservations.body[0].customer_id, register.body.user.id);
});

