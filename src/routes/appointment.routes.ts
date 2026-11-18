import { Router } from "express";
import {
  createAppointment,
  getMyAppointments,
  getAppointmentById,
  cancelMyAppointment,
  getAllAdminAppointments,
  updateAppointmentStatus,
} from "../controllers/appointment.controller";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";

const router = Router();

// Customer appointment operations
router.post("/", authenticate, authorizeRole(["customer"]), createAppointment);
router.get("/my", authenticate, authorizeRole(["customer"]), getMyAppointments);
router.get("/:id", authenticate, getAppointmentById);
router.patch("/:id/cancel", authenticate, authorizeRole(["customer"]), cancelMyAppointment);

// Admin appointment operations
router.get("/admin/all", authenticate, authorizeRole(["admin"]), getAllAdminAppointments);
router.patch("/admin/:id/status", authenticate, authorizeRole(["admin"]), updateAppointmentStatus);

export default router;
