import express from "express";

import {
  createOwnerRequest,
  getMyOwnerRequests,
  getOwnerRequestById,
  getOwnerRequests,
  reviewOwnerRequest,
} from "../controllers/ownerRequestController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

const router = express.Router();

/* Customer routes */

router.post(
  "/",
  protect,
  createOwnerRequest
);

router.get(
  "/my-requests",
  protect,
  getMyOwnerRequests
);

/* Admin routes */

router.get(
  "/",
  protect,
  authorizeRoles("admin", "super_admin"),
  getOwnerRequests
);

router.get(
  "/:id",
  protect,
  authorizeRoles("admin", "super_admin"),
  getOwnerRequestById
);

router.patch(
  "/:id/review",
  protect,
  authorizeRoles("admin", "super_admin"),
  reviewOwnerRequest
);

export default router;