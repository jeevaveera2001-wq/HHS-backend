import express from "express";

import protect from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
  requirePermission,
} from "../middleware/roleMiddleware.js";

import {
  createSupportTicket,
  getMySupportTickets,
  getManagedSupportTickets,
  getAssignableSupportStaff,
  getSupportTicketById,
  replyToSupportTicket,
  assignSupportTicket,
  updateSupportTicket,
  addInternalNote,
} from "../controllers/supportTicketController.js";

const router = express.Router();

/* =====================================
   Role groups
===================================== */

const customerRoles = [
  "customer",
  "owner",
];

const supportStaffRoles = [
  "support",
  "property_admin",
  "booking_manager",
  "finance_manager",
  "operations_manager",
  "super_admin",
];

const ticketAssignmentRoles = [
  "support",
  "operations_manager",
  "super_admin",
];

/* =====================================
   Authentication
===================================== */

/*
 * Every support-ticket route requires
 * an authenticated user.
 */

router.use(protect);

/* =====================================
   Customer and owner routes
===================================== */

/*
 * Create support ticket
 *
 * POST /api/support-tickets
 */

router.post(
  "/",
  authorizeRoles(...customerRoles),
  createSupportTicket
);

/*
 * Get tickets created by the logged-in
 * customer or owner.
 *
 * GET /api/support-tickets/my-tickets
 */

router.get(
  "/my-tickets",
  authorizeRoles(...customerRoles),
  getMySupportTickets
);

/* =====================================
   Staff support-management routes
===================================== */

/*
 * Get staff members who can be assigned
 * to support tickets.
 *
 * GET /api/support-tickets/assignable-staff
 */

router.get(
  "/assignable-staff",
  authorizeRoles(
    ...supportStaffRoles
  ),
  requirePermission(
    "tickets.respond"
  ),
  getAssignableSupportStaff
);

/*
 * Get all managed support tickets.
 *
 * Query parameters:
 * status, priority, category, assignedTo,
 * search, page and limit.
 *
 * GET /api/support-tickets/manage
 */

router.get(
  "/manage",
  authorizeRoles(
    ...supportStaffRoles
  ),
  requirePermission(
    "tickets.view"
  ),
  getManagedSupportTickets
);

/* =====================================
   Ticket assignment
===================================== */

/*
 * Assign or unassign a support ticket.
 *
 * PATCH /api/support-tickets/:id/assign
 *
 * Assign:
 * {
 *   "assignedTo": "STAFF_USER_ID"
 * }
 *
 * Unassign:
 * {
 *   "assignedTo": null
 * }
 */

router.patch(
  "/:id/assign",
  authorizeRoles(
    ...ticketAssignmentRoles
  ),
  requirePermission(
    "tickets.respond"
  ),
  assignSupportTicket
);

/* =====================================
   Ticket status management
===================================== */

/*
 * Update ticket status, category or priority.
 *
 * PATCH /api/support-tickets/:id/status
 */

router.patch(
  "/:id/status",
  authorizeRoles(
    ...supportStaffRoles
  ),
  requirePermission(
    "tickets.respond"
  ),
  updateSupportTicket
);

/* =====================================
   Internal staff notes
===================================== */

/*
 * Add an internal note.
 * Customers and owners cannot see these notes.
 *
 * POST /api/support-tickets/:id/internal-note
 */

router.post(
  "/:id/internal-note",
  authorizeRoles(
    ...supportStaffRoles
  ),
  requirePermission(
    "tickets.respond"
  ),
  addInternalNote
);

/* =====================================
   Shared conversation routes
===================================== */

/*
 * Reply to a support ticket.
 *
 * Customers can only reply to their own tickets.
 * Authorized staff can reply to managed tickets.
 * Access is verified inside the controller.
 *
 * POST /api/support-tickets/:id/reply
 */

router.post(
  "/:id/reply",
  replyToSupportTicket
);

/*
 * Get one support ticket.
 *
 * Customers can only view their own tickets.
 * Authorized staff can view managed tickets.
 * Access is verified inside the controller.
 *
 * GET /api/support-tickets/:id
 */

router.get(
  "/:id",
  getSupportTicketById
);

export default router;