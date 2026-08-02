import express from "express";

import {
  createRazorpayOrder,
  getPaymentStatus,
  initiateRazorpayRefund,
  recordPaymentFailure,
  verifyRazorpayPayment,
} from "../controllers/paymentController.js";

import {
  getFinanceSummary,
  getFinanceTransactions,
} from "../controllers/financeController.js";

import protect from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

const router = express.Router();

const financeRoles = [
  "finance_manager",
  "booking_manager",
  "operations_manager",
  "super_admin",
];

/* =====================================
   Finance dashboard routes

   Keep before /:bookingId
===================================== */

router.get(
  "/admin/summary",
  protect,
  authorizeRoles(...financeRoles),
  getFinanceSummary
);

router.get(
  "/admin/transactions",
  protect,
  authorizeRoles(...financeRoles),
  getFinanceTransactions
);

/* =====================================
   Customer payment routes
===================================== */

router.post(
  "/order",
  protect,
  createRazorpayOrder
);

router.post(
  "/verify",
  protect,
  verifyRazorpayPayment
);

router.post(
  "/failure",
  protect,
  recordPaymentFailure
);

/* =====================================
   Refund management
===================================== */

router.post(
  "/:bookingId/refund",
  protect,
  authorizeRoles(...financeRoles),
  initiateRazorpayRefund
);

/* =====================================
   Individual payment status

   Keep this route last
===================================== */

router.get(
  "/:bookingId",
  protect,
  getPaymentStatus
);

export default router;