import express from "express";

import protect from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

import {
  createContactEnquiry,
  getContactEnquiries,
  getContactEnquiryById,
  updateContactEnquiry,
} from "../controllers/contactEnquiryController.js";

const router = express.Router();

/* =====================================
   Public route
===================================== */

router.post(
  "/",
  createContactEnquiry
);

/* =====================================
   Super Admin routes
===================================== */

router.get(
  "/manage",
  protect,
  authorizeRoles(
    "super_admin"
  ),
  getContactEnquiries
);

router.get(
  "/manage/:id",
  protect,
  authorizeRoles(
    "super_admin"
  ),
  getContactEnquiryById
);

router.patch(
  "/manage/:id",
  protect,
  authorizeRoles(
    "super_admin"
  ),
  updateContactEnquiry
);

export default router;