import express from "express";

import {
  getUsers,
  getUserById,
  updateUserRole,
  toggleUserVerification,
  toggleUserStatus,
} from "../controllers/userManagementController.js";

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
   View customers and owners
===================================== */

// Support and authorized staff can view users
router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.USERS_VIEW),
  getUsers
);

/* =====================================
   Change customer/owner role
===================================== */

// Only Super Admin can promote a customer
// to owner or return an owner to customer.
router.patch(
  "/:id/role",
  protect,
  authorizeRoles("super_admin"),
  requirePermission(PERMISSIONS.OWNERS_VERIFY),
  updateUserRole
);

/* =====================================
   Verify customer or property owner
===================================== */

router.patch(
  "/:id/verification",
  protect,
  authorizeRoles(
    "property_admin",
    "operations_manager",
    "super_admin"
  ),
  requirePermission(PERMISSIONS.OWNERS_VERIFY),
  toggleUserVerification
);

/* =====================================
   Activate or suspend user
===================================== */

router.patch(
  "/:id/status",
  protect,
  authorizeRoles(
    "operations_manager",
    "super_admin"
  ),
  requirePermission(PERMISSIONS.USERS_SUSPEND),
  toggleUserStatus
);

/* =====================================
   Individual user details
   Keep this route last
===================================== */

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.USERS_VIEW),
  getUserById
);

export default router;