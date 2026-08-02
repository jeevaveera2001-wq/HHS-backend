import express from "express";

import {
  getStaffMembers,
  createStaffMember,
  updateStaffMember,
  updateStaffPermissions,
  toggleStaffStatus,
} from "../controllers/staffController.js";

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
   View staff members
===================================== */

// Super Admin and authorized operations staff
router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.STAFF_VIEW),
  getStaffMembers
);

/* =====================================
   Create staff member
===================================== */

// Restricted to Super Admin
router.post(
  "/",
  protect,
  authorizeRoles("super_admin"),
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  createStaffMember
);

/* =====================================
   Update staff member
===================================== */

// Update name, phone or staff role
router.put(
  "/:id",
  protect,
  authorizeRoles("super_admin"),
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  updateStaffMember
);

/* =====================================
   Update staff permissions
===================================== */

router.patch(
  "/:id/permissions",
  protect,
  authorizeRoles("super_admin"),
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  updateStaffPermissions
);

/* =====================================
   Activate or deactivate staff
===================================== */

router.patch(
  "/:id/status",
  protect,
  authorizeRoles("super_admin"),
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  toggleStaffStatus
);

export default router;