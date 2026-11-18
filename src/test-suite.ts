import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import http from "http";
import { createApp } from "../src/index";
import { User } from "../src/models/user.model";
import { Service } from "../src/models/service.model";
import { Appointment } from "../src/models/appointment.model";
import { Transaction } from "../src/models/transaction.model";

let mongod: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

async function runTests() {
  console.log("=== STARTING SALONBOOK FULL BACKEND VERIFICATION SUITE ===");
  
  // 1. Setup in-memory MongoDB
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  console.log(`[Test DB] Connected to In-Memory Mongo: ${uri}`);
  await mongoose.connect(uri);

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr: any = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      console.log(`[Test Server] Running at ${baseUrl}`);
      resolve();
    });
  });

  let passed = 0;
  let failed = 0;

  async function assertTest(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [✓] PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [✗] FAIL: ${name} -> ${err.message}`);
      failed++;
    }
  }

  // Tokens & IDs for tests
  let customerToken = "";
  let customerId = "";
  let adminToken = "";
  let adminId = "";
  let testServiceId = "";
  let testAppointmentId = "";

  // TEST 1: Health check
  await assertTest("Health endpoint returns 200 OK", async () => {
    const res = await fetch(`${baseUrl}/health`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.service !== "SalonBook API Server") throw new Error("Invalid service name");
  });

  // TEST 2: Password Policy Enforcement (min 6, 1 upper, 1 lower)
  await assertTest("Password policy rejects invalid password (too short / no uppercase)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Customer",
        email: "customer@test.com",
        password: "short",
      }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // TEST 3: Customer Registration & Default Role
  await assertTest("Customer signs up successfully with default role 'customer'", async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jane Doe",
        email: "jane@example.com",
        password: "Password123",
        phone: "+1234567890",
      }),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.token || data.user.role !== "customer") {
      throw new Error(`Invalid token or role: ${data.user?.role}`);
    }
    customerToken = data.token;
    customerId = data.user.id;
  });

  // TEST 4: Admin Account Setup & Authorization
  await assertTest("Admin account can sign in with role 'admin'", async () => {
    // Seed admin directly in DB for testing
    const admin = await User.create({
      name: "Admin Master",
      email: "admin@salonbook.com",
      role: "admin",
      isBlocked: false,
      provider: "credential",
    });
    adminId = admin._id.toString();

    // Generate valid admin token via utility
    const { generateToken } = await import("../src/utils/jwt.js");
    adminToken = generateToken({
      userId: adminId,
      email: admin.email,
      role: "admin",
    });

    const res = await fetch(`${baseUrl}/api/dashboard/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (res.status !== 200) throw new Error(`Admin stats returned ${res.status}`);
  });

  // TEST 5: Role isolation - Customer cannot access admin routes
  await assertTest("Customer role is blocked from accessing Admin endpoints (403)", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/admin`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // TEST 6: Admin creates new service
  await assertTest("Admin creates an active salon service", async () => {
    const res = await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        serviceName: "Signature Haircut & Beard Trim",
        category: "Haircut & Styling",
        description: "Premium haircut, wash, styling and precision beard sculpting.",
        price: 65,
        duration: 45,
        image: "https://i.ibb.co/sample/haircut.jpg",
        status: "active",
      }),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    testServiceId = data.data._id;
  });

  // TEST 7: Public services list with filter and search
  await assertTest("Public can fetch active services with category filter", async () => {
    const res = await fetch(`${baseUrl}/api/services?category=Haircut+%26+Styling`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.data || data.data.length === 0) throw new Error("No services returned");
  });

  // TEST 8: Customer books appointment
  await assertTest("Customer successfully books an appointment slot", async () => {
    const res = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        serviceId: testServiceId,
        appointmentDate: "2026-12-01",
        timeSlot: "11:00 AM",
        message: "Looking forward to the haircut",
      }),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (data.data.status !== "Pending" || data.data.paymentStatus !== "Unpaid") {
      throw new Error(`Status error: ${data.data.status}/${data.data.paymentStatus}`);
    }
    testAppointmentId = data.data._id;
  });

  // TEST 9: Double-booking prevention
  await assertTest("Double-booking same slot on same date returns 409 Conflict", async () => {
    const res = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        serviceId: testServiceId,
        appointmentDate: "2026-12-01",
        timeSlot: "11:00 AM",
      }),
    });
    if (res.status !== 409) throw new Error(`Expected 409 Conflict, got ${res.status}`);
  });

  // TEST 10: Payment restriction - cannot pay for Pending appointment
  await assertTest("Cannot create checkout session for Pending (unconfirmed) appointment", async () => {
    const res = await fetch(`${baseUrl}/api/payments/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ appointmentId: testAppointmentId }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // TEST 11: Admin confirms appointment
  await assertTest("Admin successfully confirms the pending appointment", async () => {
    const res = await fetch(`${baseUrl}/api/appointments/admin/${testAppointmentId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: "Confirmed" }),
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.data.status !== "Confirmed") throw new Error("Status was not updated to Confirmed");
  });

  // TEST 12: Customer cannot cancel confirmed appointment
  await assertTest("Customer is prevented from cancelling a Confirmed appointment", async () => {
    const res = await fetch(`${baseUrl}/api/appointments/${testAppointmentId}/cancel`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // TEST 13: Customer creates checkout session for Confirmed appointment
  let mockSessionId = "";
  await assertTest("Customer can initiate checkout for Confirmed appointment", async () => {
    const res = await fetch(`${baseUrl}/api/payments/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ appointmentId: testAppointmentId }),
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.sessionId) throw new Error("Missing sessionId");
    mockSessionId = data.sessionId;
  });

  // TEST 14: Stripe Webhook marks appointment as Paid and logs Transaction
  await assertTest("Stripe Webhook checkout.session.completed updates Paid & inserts Transaction", async () => {
    const webhookPayload = {
      id: `evt_test_${Date.now()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: mockSessionId,
          amount_total: 6500,
          currency: "usd",
          metadata: {
            appointmentId: testAppointmentId,
            customerId: customerId,
          },
        },
      },
    };

    const res = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });
    if (res.status !== 200) throw new Error(`Webhook returned ${res.status}`);

    // Verify DB state
    const appt = await Appointment.findById(testAppointmentId);
    if (appt?.paymentStatus !== "Paid") throw new Error("Appointment paymentStatus is not Paid");

    const tx = await Transaction.findOne({ appointmentId: testAppointmentId });
    if (!tx || tx.amount !== 65) throw new Error("Transaction record missing or invalid");
  });

  // TEST 15: Blocked user restriction
  await assertTest("Blocked user cannot access protected endpoints", async () => {
    // Admin blocks customer
    await fetch(`${baseUrl}/api/dashboard/admin/users/${customerId}/block`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ isBlocked: true }),
    });

    const res = await fetch(`${baseUrl}/api/appointments/my`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden for blocked user, got ${res.status}`);
  });

  console.log("\n==========================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================");

  // Teardown
  server.close();
  await mongoose.disconnect();
  await mongod.stop();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("FATAL SUITE ERROR:", e);
  process.exit(1);
});
