# Aurelia Chauffeur

A premium luxury chauffeur booking platform for airport transfers, executive travel, and private chauffeured journeys.

## Features

- Luxury, Blacklane-inspired customer booking experience
- Airport validation rules for New Jersey launch geography
- Three booking categories: Business Class, First Class, Luxury SUV
- Customer dashboard and reservation flow
- Admin dispatch dashboard
- Partner and chauffeur portal mock experiences
- Express backend APIs with in-memory data

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Production build

```bash
npm run build
```

## API

The app exposes a set of demo backend endpoints via Express at http://localhost:3001.

## Notes

This is a polished demo platform built for local development. It uses in-memory data and is designed to be extended into a full production system with Supabase, Stripe, Resend, and external maps/flight APIs.
