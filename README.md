# Puncher API

Express backend for a web time tracker. The app now uses MongoDB instead of the old in-memory seed data.

## Runtime

- Node.js
- Express 5
- MongoDB Node driver
- bcryptjs for credential hashing and verification

Default database connection:

- `MONGODB_URI=mongodb://localhost:27017`
- `MONGODB_DB_NAME=WebTimeTrackerDB`

## Project Files

- [server.js](D:\Puncher\server.js): starts the HTTP server after MongoDB connects
- [db.js](D:\Puncher\db.js): Mongo client/bootstrap module
- [app.js](D:\Puncher\app.js): routes, validation, normalization, and Mongo-backed CRUD logic

## Run

```bash
npm install
npm start
```

Server port:

- `3000` by default
- `PORT` env var overrides it

## Database Mapping

The backend is wired to `WebTimeTrackerDB`.

Collections found in MongoDB:

- `companies`
- `users`
- `time_logs`

Collection used by the API and created on first write if needed:

- `time_corrections`

## Live Schema Notes

Observed MongoDB shape:

- document `_id` values are stored as `ObjectId`
- relation fields such as `company_id` and `user_id` are also stored as `ObjectId`
- the API still accepts and returns string IDs
- route code converts between request string IDs and Mongo `ObjectId` values internally

Observed data mismatches in the current Mongo dataset:

1. `companies` does not currently contain `organization_code`, so kiosk login cannot succeed until that field exists.
2. `users.password_hash` and `users.pin_hash` contain placeholder bcrypt-looking values, so email login and kiosk PIN login will return `401` until real hashes are stored.
3. `time_logs` already contains `punch_method`, while some metadata fields such as `note`, `created_at`, and `updated_at` may be missing on older records. The API now normalizes those fields in responses.

## Current Routes

Base path: `/api`

- `GET /`
- `GET /api/health`
- `GET /api/docs`
- `POST /api/auth/login`
- `POST /api/auth/kiosk-login`
- `GET /api/companies`
- `GET /api/companies/:companyId/users`
- `POST /api/companies/:companyId/users`
- `PATCH /api/users/:userId/reset-credentials`
- `GET /api/time-logs`
- `POST /api/time-logs/punch-in`
- `POST /api/time-logs/punch-out`
- `POST /api/time-logs/:logId/notes`
- `PATCH /api/time-logs/:logId`
- `POST /api/time-corrections`
- `GET /api/time-corrections`
- `PATCH /api/time-corrections/:requestId/review`
- `GET /api/admin/:companyId/dashboard`
- `GET /api/reports/:companyId/time-logs.csv`

## Route Behavior Summary

### Health and Docs

- `GET /api/health` reports collection counts from MongoDB
- `GET /api/docs` reports runtime DB settings and currently available companies

### Authentication

- `POST /api/auth/login` looks up active users by email and verifies either legacy `sha256:` hashes or bcrypt hashes
- `POST /api/auth/kiosk-login` looks up a company by `organization_code` and then checks user PIN hashes inside that company

Current limitation:

- with the live Mongo documents, both auth routes are wired correctly but the stored values are not usable for successful login yet

### Companies and Users

- `GET /api/companies` returns sanitized company documents
- `GET /api/companies/:companyId/users` returns sanitized users for one company
- `POST /api/companies/:companyId/users` creates a user with bcrypt-hashed password and PIN
- `PATCH /api/users/:userId/reset-credentials` updates password and/or PIN using bcrypt

### Time Logs

- `GET /api/time-logs` supports filters for `company_id`, `user_id`, `status`, `from`, and `to`
- `POST /api/time-logs/punch-in` creates an active shift in MongoDB
- `POST /api/time-logs/punch-out` closes the active shift and recalculates duration
- `POST /api/time-logs/:logId/notes` appends notes
- `PATCH /api/time-logs/:logId` edits punch values, note, and status

### Time Corrections

- `POST /api/time-corrections` now writes to MongoDB
- `GET /api/time-corrections` reads from MongoDB
- `PATCH /api/time-corrections/:requestId/review` updates the request and linked time log when approved

### Admin and Reports

- `GET /api/admin/:companyId/dashboard` builds a per-company dashboard from MongoDB users, logs, and correction requests
- `GET /api/reports/:companyId/time-logs.csv` exports CSV using normalized ISO timestamps

## Verified Against MongoDB

These routes were smoke-tested successfully against `localhost:27017`:

- `GET /api/health`
- `GET /api/docs`
- `GET /api/companies`
- `GET /api/companies/:companyId/users`
- `GET /api/time-logs`
- `POST /api/time-corrections`
- `GET /api/time-corrections`
- `GET /api/admin/:companyId/dashboard`
- `GET /api/reports/:companyId/time-logs.csv`

Observed expected failure with current data:

- `POST /api/auth/login` returned `401` because stored hashes in MongoDB are placeholder values

## Next Data Fixes

To make the API fully usable with this database, the Mongo data should be corrected next:

1. add `organization_code` to each company that should support kiosk login
2. replace placeholder password and PIN hashes with real bcrypt or legacy `sha256:` hashes
3. decide whether `time_corrections` should be formally created and indexed up front
4. add indexes for user email and foreign-key style lookups if this will be used beyond lab/demo scope
