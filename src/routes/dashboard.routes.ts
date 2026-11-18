import { Router } from "express";
import {
  getAdminOverview,
  getCustomerOverview,
  getAllCustomers,
  toggleBlockUser,
  getAllTransactions,
  getMyTransactions,
} from "../controllers/dashboard.controller";
import { authenticate, authorizeRole } from "../middleware/auth.middleware";

const router = Router();

// Dashboard overviews
router.get("/customer", authenticate, authorizeRole(["customer"]), getCustomerOverview);
router.get("/admin", authenticate, authorizeRole(["admin"]), getAdminOverview);

// User management (Admin)
router.get("/admin/users", authenticate, authorizeRole(["admin"]), getAllCustomers);
router.patch("/admin/users/:id/block", authenticate, authorizeRole(["admin"]), toggleBlockUser);

// Transactions
router.get("/admin/transactions", authenticate, authorizeRole(["admin"]), getAllTransactions);
router.get("/my-transactions", authenticate, authorizeRole(["customer"]), getMyTransactions);

export default router;
