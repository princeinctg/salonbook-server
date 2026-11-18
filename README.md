# SalonBook Server

Backend API service for SalonBook – Luxury Salon Appointment Booking Platform. Built strictly according to Assignment 9 – Category 002 requirements.

---

## Important Features
- **Authentication**: JWT token verification compatible with Better Auth sessions. Secure bcrypt password hashing.
- **Strict Role Isolation**: Public registration defaults to `customer`. Dedicated admin authorization middleware with blocked-user account restrictions.
- **Service Management**: Public active service querying with category filters, title search, and price ordering. Full Admin CRUD operations.
- **Concurrency-Safe Booking**: Appointment engine enforcing time slot availability, preventing double-bookings and past bookings.
- **Stripe Checkout & Webhook Integration**: Confirmed appointments generate Stripe sessions. Idempotent webhook listener verifies cryptographic signatures and writes to the Transaction ledger.
- **Audit Analytics**: Real-time stats calculation for Customer overview and Admin dashboard.

---

## Technology Stack
- **Runtime**: Node.js & Express.js
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Security**: Helmet, CORS, jsonwebtoken, bcryptjs, Zod
- **Payments**: Stripe API & Webhooks
- **Testing**: In-memory MongoDB automation suite (`mongodb-memory-server`)

---

## Environment Variables
Copy `.env.example` to `.env` and configure:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
BETTER_AUTH_SECRET=your_secret_minimum_32_characters
BETTER_AUTH_URL=http://localhost:5000
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
IMGBB_API_KEY=your_imgbb_api_key
CLIENT_URL=http://localhost:3000
SERVER_URL=http://localhost:5000
```

---

## Local Development Instructions
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Build TypeScript**:
   ```bash
   npm run build
   ```
3. **Run Automated Test Suite**:
   ```bash
   npx tsx src/test-suite.ts
   ```
4. **Start Dev Server**:
   ```bash
   npm run dev
   ```

---

## Deployment Links & Repositories
- **Server Repository**: https://github.com/princeinctg/salonbook-server
- **Client Repository**: https://github.com/princeinctg/salonbook-client
- **Live Server Deployment**: Render / Vercel API
