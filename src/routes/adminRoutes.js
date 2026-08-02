import express from "express";

import {
  getDashboardStatistics,
} from "../controllers/adminController.js";

import protect from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
  requirePermission,
} from "../middleware/roleMiddleware.js";

import {
  PERMISSIONS,
} from "../config/permissions.js";

const router = express.Router();

/* =====================================
   Super Admin dashboard
===================================== */

router.get(
  "/dashboard-statistics",
  protect,
  authorizeRoles("super_admin"),
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  getDashboardStatistics
);

export default router;