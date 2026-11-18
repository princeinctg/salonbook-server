import { Router } from "express";
import {
  getServices,
  getServiceById,
  getAllAdminServices,
  createService,
  updateService,
  deleteService,
} from "../controllers/service.controller";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";

const router = Router();

// Public routes
router.get("/", getServices);
router.get("/admin/all", authenticate, authorizeRole(["admin"]), getAllAdminServices);
router.get("/:id", getServiceById);

// Admin-only routes
router.post("/", authenticate, authorizeRole(["admin"]), createService);
router.patch("/:id", authenticate, authorizeRole(["admin"]), updateService);
router.delete("/:id", authenticate, authorizeRole(["admin"]), deleteService);

export default router;
