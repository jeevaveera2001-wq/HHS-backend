import express from "express";

import {
  createBooking,
  checkAvailability,
  getMyBookings,
  getOwnerBookings,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
} from "../controllers/bookingController.js";

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
   Public booking routes
===================================== */

// Check room availability before login
router.get(
  "/availability",
  checkAvailability
);

/* =====================================
   Customer booking routes
===================================== */

// Create a booking
router.post(
  "/",
  protect,
  authorizeRoles(
    "customer",
    "owner"
  ),
  createBooking
);

// Get logged-in customer's bookings
router.get(
  "/my-bookings",
  protect,
  authorizeRoles(
    "customer",
    "owner"
  ),
  getMyBookings
);

/* =====================================
   Property-owner booking routes
===================================== */

// View bookings made for owner's properties
router.get(
  "/owner-bookings",
  protect,
  authorizeRoles("owner"),
  getOwnerBookings
);

/* =====================================
   Staff booking routes
===================================== */

// View and filter all bookings
router.get(
  "/manage",
  protect,
  authorizeRoles(
    "booking_manager",
    "operations_manager",
    "super_admin"
  ),
  requirePermission(
    PERMISSIONS.BOOKINGS_VIEW
  ),
  getAllBookings
);

/* =====================================
   Booking status management
===================================== */

// Owner or booking staff updates booking status.
// Controller verifies property ownership.
router.patch(
  "/:id/status",
  protect,
  authorizeRoles(
    "owner",
    "booking_manager",
    "operations_manager",
    "super_admin"
  ),
  updateBookingStatus
);

/* =====================================
   Booking cancellation
===================================== */

// Controller verifies that the user is the customer,
// property owner or authorized booking staff.
router.patch(
  "/:id/cancel",
  protect,
  cancelBooking
);

/* =====================================
   Individual booking
   Keep this route last
===================================== */

router.get(
  "/:id",
  protect,
  getBookingById
);

export default router;