import express from "express";

import {
  approvePayoutAccount,
  disableMyPayoutAccount,
  disablePayoutAccount,
  getAdminPayoutAccountById,
  getAdminPayoutAccounts,
  getMyPayoutAccount,
  markPayoutAccountUnderReview,
  rejectPayoutAccount,
  submitPayoutAccount,
} from "../controllers/payoutAccountController.js";

import protect from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

const router = express.Router();

/* =====================================
   All payout routes require login
===================================== */

router.use(protect);

/* =====================================
   Owner payout-account routes
===================================== */

/*
  Get the logged-in owner's payout
  account.

  GET /api/payout-accounts/me
*/

router.get(
  "/me",

  authorizeRoles("owner"),

  getMyPayoutAccount
);

/*
  Submit a new payout account or
  replace existing payout details.

  POST /api/payout-accounts
*/

router.post(
  "/",

  authorizeRoles("owner"),

  submitPayoutAccount
);

/*
  Disable the logged-in owner's payout
  account.

  PATCH /api/payout-accounts/me/disable
*/

router.patch(
  "/me/disable",

  authorizeRoles("owner"),

  disableMyPayoutAccount
);

/* =====================================
   Finance and Super Admin routes

   Keep these admin routes before any

   future dynamic root-level ID routes.
===================================== */

/*
  Get and filter all owner payout
  accounts.

  GET /api/payout-accounts/admin
*/

router.get(
  "/admin",

  authorizeRoles(
    "finance_manager",
    "super_admin"
  ),

  getAdminPayoutAccounts
);

/*
  Get one owner payout account.

  GET /api/payout-accounts/admin/:id
*/

router.get(
  "/admin/:id",

  authorizeRoles(
    "finance_manager",
    "super_admin"
  ),

  getAdminPayoutAccountById
);

/*
  Move a pending payout account under
  review.

  PATCH
  /api/payout-accounts/admin/:id/review
*/

router.patch(
  "/admin/:id/review",

  authorizeRoles(
    "finance_manager",
    "super_admin"
  ),

  markPayoutAccountUnderReview
);

/*
  Verify and approve a payout account.

  PATCH
  /api/payout-accounts/admin/:id/approve
*/

router.patch(
  "/admin/:id/approve",

  authorizeRoles(
    "finance_manager",
    "super_admin"
  ),

  approvePayoutAccount
);

/*
  Reject a payout account.

  PATCH
  /api/payout-accounts/admin/:id/reject
*/

router.patch(
  "/admin/:id/reject",

  authorizeRoles(
    "finance_manager",
    "super_admin"
  ),

  rejectPayoutAccount
);

/*
  Disable an owner payout account.

  PATCH
  /api/payout-accounts/admin/:id/disable
*/

router.patch(
  "/admin/:id/disable",

  authorizeRoles(
    "finance_manager",
    "super_admin"
  ),

  disablePayoutAccount
);

export default router;