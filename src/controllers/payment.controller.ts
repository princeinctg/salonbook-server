import { Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { Appointment } from "../models/appointment.model";
import { Transaction } from "../models/transaction.model";

// Initialize Stripe instance if key exists
const stripe = ENV.STRIPE_SECRET_KEY ? new Stripe(ENV.STRIPE_SECRET_KEY, { apiVersion: "2025-01-27.acacia" as any }) : null;

// CUSTOMER: Create Stripe Checkout Session
export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { appointmentId } = req.body;
    if (!appointmentId) {
      res.status(400).json({ success: false, message: "appointmentId is required" });
      return;
    }

    const appointment = await Appointment.findById(appointmentId).populate("serviceId");
    if (!appointment) {
      res.status(404).json({ success: false, message: "Appointment not found" });
      return;
    }

    // Critical security: Ownership verification
    if (appointment.customerId.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, message: "Forbidden. You can only pay for your own appointments." });
      return;
    }

    // Critical security: Must be Confirmed and Unpaid
    if (appointment.status !== "Confirmed") {
      res.status(400).json({
        success: false,
        message: `Cannot pay for appointment with status '${appointment.status}'. Only Confirmed appointments can be paid.`,
      });
      return;
    }

    if (appointment.paymentStatus === "Paid") {
      res.status(400).json({ success: false, message: "This appointment has already been paid." });
      return;
    }

    const service: any = appointment.serviceId;
    const serviceName = service ? service.serviceName : "Salon Appointment";
    const amountInCents = Math.round(appointment.servicePrice * 100);

    // If Stripe is in mock mode or no live key configured for local dev
    if (!stripe || ENV.STRIPE_SECRET_KEY.startsWith("sk_test_mock")) {
      const mockSessionId = `cs_test_mock_${Date.now()}_${appointment._id}`;
      res.status(200).json({
        success: true,
        mock: true,
        sessionId: mockSessionId,
        url: `${ENV.CLIENT_URL}/payment/success?session_id=${mockSessionId}&appointment_id=${appointment._id}`,
        message: "Dev Mock Stripe Checkout Session created",
      });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `SalonBook: ${serviceName}`,
              description: `Appointment on ${appointment.appointmentDate} at ${appointment.timeSlot}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${ENV.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&appointment_id=${appointment._id}`,
      cancel_url: `${ENV.CLIENT_URL}/payment/cancel?appointment_id=${appointment._id}`,
      metadata: {
        appointmentId: appointment._id.toString(),
        customerId: req.user._id.toString(),
      },
    });

    res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error creating checkout session", error: error.message });
  }
}

// STRIPE WEBHOOK HANDLER
// CRITICAL SECURITY: Never mark payment as Paid from a client redirect. Only verified Stripe Webhook events can mark Paid.
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;

  try {
    // In mock mode or when simulated in testing
    if (!stripe || ENV.STRIPE_SECRET_KEY.startsWith("sk_test_mock")) {
      if (Buffer.isBuffer(req.body)) {
        event = JSON.parse(req.body.toString("utf8"));
      } else if (typeof req.body === "string") {
        event = JSON.parse(req.body);
      } else {
        event = req.body;
      }
    } else {
      if (!sig || !ENV.STRIPE_WEBHOOK_SECRET) {
        res.status(400).send("Webhook signature or secret missing");
        return;
      }
      event = stripe.webhooks.constructEvent(req.body, sig, ENV.STRIPE_WEBHOOK_SECRET);
    }
  } catch (err: any) {
    console.error(`[Stripe Webhook] Verification failed: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle successful checkout completion
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const appointmentId = session.metadata?.appointmentId || (session as any).appointmentId;
    const customerId = session.metadata?.customerId || (session as any).customerId;
    const amount = (session.amount_total ? session.amount_total / 100 : (session as any).amount) || 0;
    const currency = session.currency || "usd";

    if (appointmentId) {
      try {
        // Prevent duplicate processing via Stripe Session ID check in Transactions
        const existingTx = await Transaction.findOne({ stripeSessionId: session.id });
        if (existingTx) {
          console.log(`[Stripe Webhook] Duplicate session ${session.id} ignored.`);
          res.status(200).json({ received: true, message: "Already processed" });
          return;
        }

        // Atomically update Appointment to Paid
        const updatedAppointment = await Appointment.findByIdAndUpdate(
          appointmentId,
          { paymentStatus: "Paid" },
          { new: true }
        );

        if (updatedAppointment) {
          // Record Transaction log
          await Transaction.create({
            appointmentId: updatedAppointment._id,
            customerId: customerId || updatedAppointment.customerId,
            amount: amount || updatedAppointment.servicePrice,
            currency,
            stripeSessionId: session.id,
            status: "succeeded",
          });
          console.log(`[Stripe Webhook] Appointment ${appointmentId} marked as Paid. Transaction recorded.`);
        }
      } catch (dbErr: any) {
        console.error(`[Stripe Webhook] DB update error: ${dbErr.message}`);
        res.status(500).send("Internal server error updating booking");
        return;
      }
    }
  }

  res.status(200).json({ received: true });
}

// Development helper: Simulate mock payment verification safely for testing
export async function simulateMockPaymentSuccess(req: Request, res: Response): Promise<void> {
  try {
    const { appointmentId, sessionId } = req.body;
    if (!appointmentId) {
      res.status(400).json({ success: false, message: "appointmentId required" });
      return;
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      res.status(404).json({ success: false, message: "Appointment not found" });
      return;
    }

    const sid = sessionId || `mock_session_${Date.now()}`;
    const existing = await Transaction.findOne({ stripeSessionId: sid });
    if (!existing) {
      appointment.paymentStatus = "Paid";
      await appointment.save();

      await Transaction.create({
        appointmentId: appointment._id,
        customerId: appointment.customerId,
        amount: appointment.servicePrice,
        currency: "usd",
        stripeSessionId: sid,
        status: "succeeded",
      });
    }

    res.status(200).json({
      success: true,
      message: "Payment successfully verified and recorded",
      paymentStatus: "Paid",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}
