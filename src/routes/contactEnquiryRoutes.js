import express from "express";

import {
  createContactEnquiry,
} from "../controllers/contactEnquiryController.js";

const router = express.Router();

/* =====================================
   Public contact-enquiry route
===================================== */

/*
 * POST /api/contact-enquiries
 *
 * This is a public route.
 * Customers should be able to submit an
 * enquiry without logging in.
 */

router.post(
  "/",
  createContactEnquiry
);

export default router;