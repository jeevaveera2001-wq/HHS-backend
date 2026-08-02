import express from "express";

import {
  createReview,
  deleteReview,
  getManagedReviews,
  getMyReviews,
  getPropertyReviews,
  replyToReview,
  updateReview,
  updateReviewVisibility,
} from "../controllers/reviewController.js";

import protect from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

const router = express.Router();

/* =====================================
   Public routes
===================================== */

router.get(
  "/property/:propertyId",
  getPropertyReviews
);

/* =====================================
   Managed review listing
===================================== */

router.get(
  "/manage",
  protect,

  authorizeRoles(
    "owner",
    "operations_manager",
    "super_admin"
  ),

  getManagedReviews
);

/* =====================================
   Customer routes
===================================== */

router.get(
  "/my-reviews",
  protect,

  authorizeRoles(
    "customer",
    "owner"
  ),

  getMyReviews
);

router.post(
  "/",
  protect,

  authorizeRoles(
    "customer",
    "owner"
  ),

  createReview
);

router.put(
  "/:id",
  protect,

  authorizeRoles(
    "customer",
    "owner"
  ),

  updateReview
);

/* =====================================
   Owner reply route
===================================== */

router.patch(
  "/:id/reply",
  protect,

  authorizeRoles(
    "owner",
    "operations_manager",
    "super_admin"
  ),

  replyToReview
);

/* =====================================
   Review moderation
===================================== */

router.patch(
  "/:id/visibility",
  protect,

  authorizeRoles(
    "operations_manager",
    "super_admin"
  ),

  updateReviewVisibility
);

/* =====================================
   Delete review
===================================== */

router.delete(
  "/:id",
  protect,
  deleteReview
);

export default router;