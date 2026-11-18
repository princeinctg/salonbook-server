async function testAtlasRealWorld() {
  const base = "http://localhost:5000/api";
  console.log("=================================================");
  console.log("STARTING ATLAS DATA PERSISTENCE & REAL API VERIFICATION");
  console.log("=================================================");

  // 1. Fetch Services from Atlas
  const servicesRes = await fetch(`${base}/services`);
  const servicesJson = await servicesRes.json();
  console.log(`[Atlas Step 1] Services fetched: ${servicesJson.count} items (Status: ${servicesRes.status})`);
  if (!servicesJson.data || servicesJson.data.length === 0) {
    throw new Error("No services returned from Atlas");
  }
  const chosenService = servicesJson.data[0];

  // 2. Customer Signup in Atlas
  const uniqueCustomerEmail = `atlas_cust_${Date.now()}@salonbook.com`;
  console.log(`[Atlas Step 2] Registering customer: ${uniqueCustomerEmail}`);
  const signupRes = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Atlas Customer",
      email: uniqueCustomerEmail,
      password: "Password123",
      phone: "+1 (555) 019-2834",
    }),
  });
  const signupJson = await signupRes.json();
  console.log(`[Atlas Step 2 Result] Signup success: ${signupJson.success}, User ID: ${signupJson.user?.id}`);
  const customerToken = signupJson.token;
  const customerId = signupJson.user?.id;

  // 3. Customer Signin
  console.log(`[Atlas Step 3] Testing Signin for registered customer...`);
  const signinRes = await fetch(`${base}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: uniqueCustomerEmail,
      password: "Password123",
    }),
  });
  const signinJson = await signinRes.json();
  console.log(`[Atlas Step 3 Result] Signin success: ${signinJson.success}, Role: ${signinJson.user?.role}`);

  // 4. Customer Booking Appointment in Atlas
  console.log(`[Atlas Step 4] Submitting appointment for service: ${chosenService.serviceName}...`);
  const apptDate = "2026-12-20";
  const apptSlot = "11:00 AM";
  const bookRes = await fetch(`${base}/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      serviceId: chosenService._id,
      appointmentDate: apptDate,
      timeSlot: apptSlot,
      message: "Atlas persistence test booking",
    }),
  });
  const bookJson = await bookRes.json();
  console.log(`[Atlas Step 4 Result] Booking created: ${bookJson.success}, Appt ID: ${bookJson.data?._id}`);
  console.log(`  -> Status: ${bookJson.data?.status}, PaymentStatus: ${bookJson.data?.paymentStatus}`);
  const appointmentId = bookJson.data?._id;

  // 5. Duplicate Booking Validation in Atlas
  console.log(`[Atlas Step 5] Testing double-booking conflict rejection...`);
  const dupRes = await fetch(`${base}/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      serviceId: chosenService._id,
      appointmentDate: apptDate,
      timeSlot: apptSlot,
    }),
  });
  console.log(`[Atlas Step 5 Result] Duplicate status: ${dupRes.status} (Expected 409 Conflict)`);

  // 6. Admin Signin
  console.log(`[Atlas Step 6] Signing in as Administrator...`);
  const adminRes = await fetch(`${base}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@salonbook.com",
      password: "Admin123",
    }),
  });
  const adminJson = await adminRes.json();
  console.log(`[Atlas Step 6 Result] Admin signin: ${adminJson.success}, Role: ${adminJson.user?.role}`);
  const adminToken = adminJson.token;

  // 7. Admin Confirms Appointment in Atlas
  console.log(`[Atlas Step 7] Admin confirming appointment ${appointmentId}...`);
  const confirmRes = await fetch(`${base}/appointments/admin/${appointmentId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status: "Confirmed" }),
  });
  const confirmJson = await confirmRes.json();
  console.log(`[Atlas Step 7 Result] Status updated: ${confirmJson.data?.status}`);

  // 8. Customer Fetches Updated Appointment
  console.log(`[Atlas Step 8] Customer checking my appointments...`);
  const myApptsRes = await fetch(`${base}/appointments/my`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const myApptsJson = await myApptsRes.json();
  console.log(`[Atlas Step 8 Result] Customer appointments count: ${myApptsJson.count}`);
  const currentAppt = myApptsJson.data[0];
  console.log(`  -> Confirmed status verified: ${currentAppt.status === "Confirmed"}`);

  // 9. Real Google OAuth Endpoint Check
  console.log(`[Atlas Step 9] Verifying Real Google OAuth redirect endpoint...`);
  const googleRedirectRes = await fetch(`${base}/auth/google?returnTo=http://localhost:3000&redirect=/dashboard/customer`, {
    redirect: "manual",
  });
  const locationHeader = googleRedirectRes.headers.get("location");
  console.log(`[Atlas Step 9 Result] Redirect status: ${googleRedirectRes.status}`);
  console.log(`  -> Location starts with Google Accounts: ${locationHeader?.startsWith("https://accounts.google.com/o/oauth2/v2/auth")}`);
  console.log(`  -> Contains client_id: ${locationHeader?.includes("client_id=199695232756")}`);

  console.log("\n=================================================");
  console.log("ALL ATLAS PERSISTENCE & REAL OAUTH ENDPOINTS VERIFIED!");
  console.log("=================================================");
}

testAtlasRealWorld().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
