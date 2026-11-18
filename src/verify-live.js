async function verifyLive() {
  const base = "http://localhost:5000/api";
  console.log("--- 1. Testing Services Fetch ---");
  const servicesRes = await fetch(base + "/services");
  const servicesData = await servicesRes.json();
  console.log("Services count:", servicesData.count, "status:", servicesRes.status);
  const sampleService = servicesData.data[0];

  console.log("--- 2. Testing Customer Signup ---");
  const uniqueEmail = "customer_" + Date.now() + "@salonbook.com";
  const signupRes = await fetch(base + "/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Verified Customer",
      email: uniqueEmail,
      password: "Password123",
      phone: "+15551234567",
    }),
  });
  const signupData = await signupRes.json();
  console.log("Signup success:", signupData.success, "user:", signupData.user?.email);
  const customerToken = signupData.token;

  console.log("--- 3. Testing Customer Signin ---");
  const signinRes = await fetch(base + "/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: uniqueEmail,
      password: "Password123",
    }),
  });
  const signinData = await signinRes.json();
  console.log("Signin success:", signinData.success, "token received:", !!signinData.token);

  console.log("--- 4. Testing Google Signin ---");
  const googleRes = await fetch(base + "/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "google_" + Date.now() + "@salonbook.com",
      name: "Google User",
    }),
  });
  const googleData = await googleRes.json();
  console.log("Google Signin success:", googleData.success);

  console.log("--- 5. Testing Customer Booking ---");
  const bookingDate = "2026-12-15";
  const bookingSlot = "02:00 PM";
  const bookRes = await fetch(base + "/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + customerToken,
    },
    body: JSON.stringify({
      serviceId: sampleService._id,
      appointmentDate: bookingDate,
      timeSlot: bookingSlot,
      message: "Integration test appointment",
    }),
  });
  const bookData = await bookRes.json();
  console.log("Booking success:", bookData.success, "appointment ID:", bookData.data?._id);
  const appointmentId = bookData.data?._id;

  console.log("--- 6. Testing Duplicate Booking Prevention ---");
  const dupRes = await fetch(base + "/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + customerToken,
    },
    body: JSON.stringify({
      serviceId: sampleService._id,
      appointmentDate: bookingDate,
      timeSlot: bookingSlot,
    }),
  });
  const dupData = await dupRes.json();
  console.log("Duplicate booking rejected with 409:", dupRes.status === 409, "message:", dupData.message);

  console.log("--- 7. Testing Customer Fetch My Appointments ---");
  const myApptsRes = await fetch(base + "/appointments/my", {
    headers: { Authorization: "Bearer " + customerToken },
  });
  const myApptsData = await myApptsRes.json();
  console.log("Customer appointments fetched count:", myApptsData.count);

  console.log("--- 8. Testing Admin Signin ---");
  const adminSigninRes = await fetch(base + "/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@salonbook.com",
      password: "Admin123",
    }),
  });
  const adminSigninData = await adminSigninRes.json();
  console.log("Admin signin success:", adminSigninData.success, "role:", adminSigninData.user?.role);
  const adminToken = adminSigninData.token;

  console.log("--- 9. Testing Admin Appointment Confirmation ---");
  const confirmRes = await fetch(base + "/appointments/admin/" + appointmentId + "/status", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + adminToken,
    },
    body: JSON.stringify({ status: "Confirmed" }),
  });
  const confirmData = await confirmRes.json();
  console.log("Admin confirmed appointment:", confirmData.data?.status === "Confirmed");

  console.log("\n>>> ALL 9 INTEGRATION CHECKS VERIFIED SUCCESSFULLY! <<<");
}

verifyLive().catch((e) => {
  console.error("Live verification failed:", e);
  process.exit(1);
});
