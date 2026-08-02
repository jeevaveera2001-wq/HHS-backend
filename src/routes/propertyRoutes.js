import express from "express";

import {
  approveProperty,
  createProperty,
  deleteProperty,
  getAllPropertiesForAdmin,
  getFeaturedProperties,
  getManagedPropertyById,
  getMyProperties,
  getPendingProperties,
  getPublicProperties,
  getPublicPropertyById,
  rejectProperty,
  togglePropertyActiveStatus,
  updateFeaturedStatus,
  updateProperty,
} from "../controllers/propertyController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/* =====================================================
   Public routes
===================================================== */

// GET /api/properties
router.get(
  "/",
  getPublicProperties
);

// GET /api/properties/featured
router.get(
  "/featured",
  getFeaturedProperties
);

/* =====================================================
   Current user/owner routes
===================================================== */

// POST /api/properties
// Any authenticated user can submit a property.
router.post(
  "/",
  protect,
  createProperty
);

// GET /api/properties/owner/my-properties
router.get(
  "/owner/my-properties",
  protect,
  getMyProperties
);

// GET /api/properties/manage/:id
router.get(
  "/manage/:id",
  protect,
  getManagedPropertyById
);

/* =====================================================
   Admin routes
===================================================== */

// GET /api/properties/admin/all
router.get(
  "/admin/all",
  protect,
  authorizeRoles(
    "admin",
    "super_admin"
  ),
  getAllPropertiesForAdmin
);

// GET /api/properties/admin/pending
router.get(
  "/admin/pending",
  protect,
  authorizeRoles(
    "admin",
    "super_admin"
  ),
  getPendingProperties
);

// PATCH /api/properties/admin/:id/approve
router.patch(
  "/admin/:id/approve",
  protect,
  authorizeRoles(
    "admin",
    "super_admin"
  ),
  approveProperty
);

// PATCH /api/properties/admin/:id/reject
router.patch(
  "/admin/:id/reject",
  protect,
  authorizeRoles(
    "admin",
    "super_admin"
  ),
  rejectProperty
);

// PATCH /api/properties/admin/:id/featured
router.patch(
  "/admin/:id/featured",
  protect,
  authorizeRoles(
    "admin",
    "super_admin"
  ),
  updateFeaturedStatus
);

/* =====================================================
   Owner/Admin property-management routes
===================================================== */

// PUT /api/properties/:id
router.put(
  "/:id",
  protect,
  updateProperty
);

// PATCH /api/properties/:id/active
router.patch(
  "/:id/active",
  protect,
  togglePropertyActiveStatus
);

// DELETE /api/properties/:id
router.delete(
  "/:id",
  protect,
  deleteProperty
);

/* =====================================================
   Single public property route

   This route must remain last because it contains
   the dynamic /:id parameter.
===================================================== */

// GET /api/properties/:id
router.get(
  "/:id",
  getPublicPropertyById
);

export default router;