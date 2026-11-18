import { Router } from "express";
import {
  createCheckoutSession,
  handleStripeWebhook,
  simulateMockPaymentSuccess,
} from "../controllers/payment.controller";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";

const router = Router();

router.post("/create-checkout-session", authenticate, authorizeRole(["customer"]), createCheckoutSession);
router.post("/webhook", handleStripeWebhook);
router.post("/simulate-success", authenticate, simulateMockPaymentSuccess);

export default router;
