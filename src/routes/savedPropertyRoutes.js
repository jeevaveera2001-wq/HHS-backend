import express from "express";

import {
  checkSavedProperty,
  getMySavedProperties,
  getSavedPropertyIds,
  removeSavedProperty,
  saveProperty,
  toggleSavedProperty,
} from "../controllers/savedPropertyController.js";

import protect from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

const router = express.Router();

/* =====================================
   Authentication and role protection
===================================== */

router.use(
  protect,

  authorizeRoles(
    "customer",
    "owner"
  )
);

/* =====================================
   Get saved properties

   GET /api/saved-properties
===================================== */

router.get(
  "/",
  getMySavedProperties
);

/* =====================================
   Get saved property IDs

   Keep before /:propertyId routes.

   GET /api/saved-properties/ids
===================================== */

router.get(
  "/ids",
  getSavedPropertyIds
);

/* =====================================
   Check individual property

   GET /api/saved-properties/:propertyId/check
===================================== */

router.get(
  "/:propertyId/check",
  checkSavedProperty
);

/* =====================================
   Save property

   POST /api/saved-properties/:propertyId
===================================== */

router.post(
  "/:propertyId",
  saveProperty
);

/* =====================================
   Toggle saved property

   PATCH /api/saved-properties/:propertyId/toggle
===================================== */

router.patch(
  "/:propertyId/toggle",
  toggleSavedProperty
);

/* =====================================
   Remove saved property

   DELETE /api/saved-properties/:propertyId
===================================== */

router.delete(
  "/:propertyId",
  removeSavedProperty
);

export default router;