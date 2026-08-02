import mongoose from "mongoose";

import SupportTicket from "../models/SupportTicket.js";
import User from "../models/User.js";

/* =====================================
   Support staff roles
===================================== */

const SUPPORT_STAFF_ROLES = [
  "support",
  "property_admin",
  "booking_manager",
  "finance_manager",
  "operations_manager",
  "super_admin",
];

const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_for_customer",
  "resolved",
  "closed",
];

const TICKET_PRIORITIES = [
  "low",
  "medium",
  "high",
  "urgent",
];

const TICKET_CATEGORIES = [
  "general",
  "account",
  "booking",
  "payment",
  "refund",
  "property",
  "owner_verification",
  "technical",
  "complaint",
  "other",
];

/* =====================================
   Helper functions
===================================== */

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(
    id
  );
};

const isSupportStaff = (user) => {
  return SUPPORT_STAFF_ROLES.includes(
    user?.role
  );
};

const getDocumentId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value._id || value.id;
  }

  return value;
};

const isTicketOwner = (
  ticket,
  user
) => {
  const ticketUserId = getDocumentId(
    ticket.createdBy
  );

  const currentUserId = getDocumentId(
    user
  );

  if (
    !ticketUserId ||
    !currentUserId
  ) {
    return false;
  }

  return (
    String(ticketUserId) ===
    String(currentUserId)
  );
};

const canAccessTicket = (
  ticket,
  user
) => {
  return (
    isSupportStaff(user) ||
    isTicketOwner(ticket, user)
  );
};

const escapeRegularExpression = (
  value
) => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/* =====================================
   Ticket population
===================================== */

const populateTicketQuery = (query) => {
  return query.populate([
    {
      path: "createdBy",
      select:
        "fullName email phone role profileImage",
    },
    {
      path: "assignedTo",
      select:
        "fullName email phone role profileImage",
    },
    {
      path: "relatedBooking",
      select:
        "bookingReference bookingStatus paymentStatus checkInDate checkOutDate",
    },
    {
      path: "relatedProperty",
      select:
        "title slug location images status",
    },
    {
      path: "messages.sender",
      select:
        "fullName email role profileImage",
    },
    {
      path: "internalNotes.addedBy",
      select:
        "fullName email role profileImage",
    },
    {
      path: "resolvedBy",
      select:
        "fullName email role profileImage",
    },
    {
      path: "closedBy",
      select:
        "fullName email role profileImage",
    },
  ]);
};

const findPopulatedTicket = async (
  ticketId
) => {
  return populateTicketQuery(
    SupportTicket.findById(ticketId)
  );
};

/* =====================================
   Create support ticket
===================================== */

export const createSupportTicket =
  async (req, res) => {
    try {
      const subject =
        req.body.subject?.trim();

      const description =
        req.body.description?.trim();

      const category =
        req.body.category || "general";

      const priority =
        req.body.priority || "medium";

      const relatedBooking =
        req.body.relatedBooking || null;

      const relatedProperty =
        req.body.relatedProperty || null;

      const attachments =
        Array.isArray(
          req.body.attachments
        )
          ? req.body.attachments
          : [];

      if (!subject || !description) {
        return res.status(400).json({
          success: false,
          message:
            "Subject and description are required.",
        });
      }

      if (subject.length < 5) {
        return res.status(400).json({
          success: false,
          message:
            "Subject must contain at least 5 characters.",
        });
      }

      if (description.length < 10) {
        return res.status(400).json({
          success: false,
          message:
            "Description must contain at least 10 characters.",
        });
      }

      if (
        !TICKET_CATEGORIES.includes(
          category
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support-ticket category.",
        });
      }

      if (
        !TICKET_PRIORITIES.includes(
          priority
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support-ticket priority.",
        });
      }

      if (
        relatedBooking &&
        !isValidObjectId(
          relatedBooking
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid related booking ID.",
        });
      }

      if (
        relatedProperty &&
        !isValidObjectId(
          relatedProperty
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid related property ID.",
        });
      }

      const ticket =
        await SupportTicket.create({
          createdBy: req.user._id,
          subject,
          description,
          category,
          priority,
          relatedBooking,
          relatedProperty,
          attachments,
          status: "open",
          lastReplyAt: new Date(),
        });

      const populatedTicket =
        await findPopulatedTicket(
          ticket._id
        );

      return res.status(201).json({
        success: true,
        message:
          "Support ticket created successfully.",
        ticket: populatedTicket,
      });
    } catch (error) {
      console.error(
        "Create support ticket error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to create support ticket.",
      });
    }
  };

/* =====================================
   Get logged-in user's tickets
===================================== */

export const getMySupportTickets =
  async (req, res) => {
    try {
      const {
        status,
        priority,
        category,
        search,
      } = req.query;

      const page = Math.max(
        Number.parseInt(
          req.query.page,
          10
        ) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number.parseInt(
            req.query.limit,
            10
          ) || 20,
          1
        ),
        100
      );

      const filter = {
        createdBy: req.user._id,
      };

      if (
        status &&
        status !== "all"
      ) {
        filter.status = status;
      }

      if (
        priority &&
        priority !== "all"
      ) {
        filter.priority = priority;
      }

      if (
        category &&
        category !== "all"
      ) {
        filter.category = category;
      }

      if (search?.trim()) {
        const safeSearch =
          escapeRegularExpression(
            search.trim()
          );

        filter.$or = [
          {
            ticketNumber: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            subject: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            description: {
              $regex: safeSearch,
              $options: "i",
            },
          },
        ];
      }

      const skip =
        (page - 1) * limit;

      const [
        tickets,
        total,
      ] = await Promise.all([
        populateTicketQuery(
          SupportTicket.find(filter)
        )
          .sort({
            updatedAt: -1,
          })
          .skip(skip)
          .limit(limit),

        SupportTicket.countDocuments(
          filter
        ),
      ]);

      return res.status(200).json({
        success: true,
        tickets,

        pagination: {
          page,
          limit,
          total,

          pages: Math.ceil(
            total / limit
          ),
        },
      });
    } catch (error) {
      console.error(
        "Get my support tickets error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load your support tickets.",
      });
    }
  };

/* =====================================
   Get managed support tickets
===================================== */

export const getManagedSupportTickets =
  async (req, res) => {
    try {
      const {
        status,
        priority,
        category,
        assignedTo,
        search,
      } = req.query;

      const page = Math.max(
        Number.parseInt(
          req.query.page,
          10
        ) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number.parseInt(
            req.query.limit,
            10
          ) || 30,
          1
        ),
        100
      );

      const filter = {};

      if (
        status &&
        status !== "all"
      ) {
        filter.status = status;
      }

      if (
        priority &&
        priority !== "all"
      ) {
        filter.priority = priority;
      }

      if (
        category &&
        category !== "all"
      ) {
        filter.category = category;
      }

      if (
        assignedTo === "unassigned"
      ) {
        filter.assignedTo = null;
      } else if (
        assignedTo &&
        assignedTo !== "all"
      ) {
        if (
          !isValidObjectId(
            assignedTo
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid assigned staff ID.",
          });
        }

        filter.assignedTo =
          assignedTo;
      }

      if (search?.trim()) {
        const safeSearch =
          escapeRegularExpression(
            search.trim()
          );

        filter.$or = [
          {
            ticketNumber: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            subject: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            description: {
              $regex: safeSearch,
              $options: "i",
            },
          },
        ];
      }

      const skip =
        (page - 1) * limit;

      const [
        tickets,
        total,
      ] = await Promise.all([
        populateTicketQuery(
          SupportTicket.find(filter)
        )
          .sort({
            priority: -1,
            updatedAt: -1,
          })
          .skip(skip)
          .limit(limit),

        SupportTicket.countDocuments(
          filter
        ),
      ]);

      return res.status(200).json({
        success: true,
        tickets,

        pagination: {
          page,
          limit,
          total,

          pages: Math.ceil(
            total / limit
          ),
        },
      });
    } catch (error) {
      console.error(
        "Get managed tickets error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load support tickets.",
      });
    }
  };

/* =====================================
   Get assignable staff
===================================== */

export const getAssignableSupportStaff =
  async (req, res) => {
    try {
      const staff = await User.find({
        role: {
          $in: SUPPORT_STAFF_ROLES,
        },

        isActive: true,
      })
        .select(
          "fullName email phone role profileImage isActive"
        )
        .sort({
          role: 1,
          fullName: 1,
        })
        .lean();

      return res.status(200).json({
        success: true,
        count: staff.length,
        staff,
      });
    } catch (error) {
      console.error(
        "Get assignable support staff error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load assignable support staff.",
      });
    }
  };

/* =====================================
   Get one support ticket
===================================== */

export const getSupportTicketById =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support-ticket ID.",
        });
      }

      const ticket =
        await findPopulatedTicket(id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
      }

      if (
        !canAccessTicket(
          ticket,
          req.user
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have permission to view this ticket.",
        });
      }

      /*
       * Internal notes must not be exposed
       * to customers or owners.
       */

      if (!isSupportStaff(req.user)) {
        ticket.internalNotes = [];
      }

      return res.status(200).json({
        success: true,
        ticket,
      });
    } catch (error) {
      console.error(
        "Get support ticket error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load support ticket.",
      });
    }
  };

/* =====================================
   Reply to support ticket
===================================== */

export const replyToSupportTicket =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const message =
        req.body.message?.trim();

      const attachments =
        Array.isArray(
          req.body.attachments
        )
          ? req.body.attachments
          : [];

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support-ticket ID.",
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          message:
            "Reply message is required.",
        });
      }

      if (message.length > 5000) {
        return res.status(400).json({
          success: false,
          message:
            "Reply message cannot exceed 5000 characters.",
        });
      }

      const ticket =
        await SupportTicket.findById(id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
      }

      if (
        !canAccessTicket(
          ticket,
          req.user
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have permission to reply to this ticket.",
        });
      }

      if (
        ["resolved", "closed"].includes(
          ticket.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Resolved or closed tickets cannot receive new replies.",
        });
      }

      const staffReply =
        isSupportStaff(req.user);

      ticket.messages.push({
        sender: req.user._id,
        senderRole: req.user.role,
        message,
        attachments,
        isStaffReply: staffReply,
      });

      ticket.lastReplyAt =
        new Date();

      if (
        staffReply &&
        ticket.status === "open"
      ) {
        ticket.status =
          "in_progress";
      }

      if (
        !staffReply &&
        ticket.status ===
          "waiting_for_customer"
      ) {
        ticket.status = "open";
      }

      await ticket.save();

      const populatedTicket =
        await findPopulatedTicket(id);

      if (!staffReply) {
        populatedTicket.internalNotes =
          [];
      }

      return res.status(200).json({
        success: true,
        message:
          "Reply added successfully.",
        ticket: populatedTicket,
      });
    } catch (error) {
      console.error(
        "Reply to ticket error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to add ticket reply.",
      });
    }
  };

/* =====================================
   Assign support ticket
===================================== */

export const assignSupportTicket =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const {
        assignedTo,
      } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support-ticket ID.",
        });
      }

      const ticket =
        await SupportTicket.findById(id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
      }

      /*
       * Allow null or an empty value to
       * unassign the ticket.
       */

      if (!assignedTo) {
        ticket.assignedTo = null;
        ticket.assignedAt = null;

        await ticket.save();

        const populatedTicket =
          await findPopulatedTicket(id);

        return res.status(200).json({
          success: true,
          message:
            "Ticket assignment removed.",
          ticket: populatedTicket,
        });
      }

      if (
        !isValidObjectId(
          assignedTo
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid staff member ID.",
        });
      }

      const staffMember =
        await User.findOne({
          _id: assignedTo,

          role: {
            $in: SUPPORT_STAFF_ROLES,
          },

          isActive: true,
        }).select(
          "_id fullName email role isActive"
        );

      if (!staffMember) {
        return res.status(404).json({
          success: false,
          message:
            "Assignable staff member not found.",
        });
      }

      ticket.assignedTo =
        staffMember._id;

      ticket.assignedAt =
        new Date();

      if (ticket.status === "open") {
        ticket.status =
          "in_progress";
      }

      await ticket.save();

      const populatedTicket =
        await findPopulatedTicket(id);

      return res.status(200).json({
        success: true,

        message:
          `Ticket assigned to ${staffMember.fullName}.`,

        ticket: populatedTicket,
      });
    } catch (error) {
      console.error(
        "Assign support ticket error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to assign support ticket.",
      });
    }
  };

/* =====================================
   Update ticket
===================================== */

export const updateSupportTicket =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const {
        status,
        priority,
        category,
      } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support-ticket ID.",
        });
      }

      const ticket =
        await SupportTicket.findById(id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
      }

      if (status) {
        if (
          !TICKET_STATUSES.includes(
            status
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid ticket status.",
          });
        }

        ticket.status = status;

        if (status === "resolved") {
          ticket.resolvedAt =
            new Date();

          ticket.resolvedBy =
            req.user._id;

          ticket.closedAt = null;
          ticket.closedBy = null;
        } else if (
          status === "closed"
        ) {
          ticket.closedAt =
            new Date();

          ticket.closedBy =
            req.user._id;
        } else {
          ticket.resolvedAt = null;
          ticket.resolvedBy = null;
          ticket.closedAt = null;
          ticket.closedBy = null;
        }
      }

      if (priority) {
        if (
          !TICKET_PRIORITIES.includes(
            priority
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid ticket priority.",
          });
        }

        ticket.priority = priority;
      }

      if (category) {
        if (
          !TICKET_CATEGORIES.includes(
            category
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid ticket category.",
          });
        }

        ticket.category = category;
      }

      await ticket.save();

      const populatedTicket =
        await findPopulatedTicket(id);

      return res.status(200).json({
        success: true,
        message:
          "Support ticket updated successfully.",
        ticket: populatedTicket,
      });
    } catch (error) {
      console.error(
        "Update support ticket error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update support ticket.",
      });
    }
  };

/* =====================================
   Add internal staff note
===================================== */

export const addInternalNote =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const note =
        req.body.note?.trim();

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support-ticket ID.",
        });
      }

      if (!note) {
        return res.status(400).json({
          success: false,
          message:
            "Internal note is required.",
        });
      }

      if (note.length > 3000) {
        return res.status(400).json({
          success: false,
          message:
            "Internal note cannot exceed 3000 characters.",
        });
      }

      if (!isSupportStaff(req.user)) {
        return res.status(403).json({
          success: false,
          message:
            "Only authorized staff can add internal notes.",
        });
      }

      const ticket =
        await SupportTicket.findById(id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
      }

      ticket.internalNotes.push({
        addedBy: req.user._id,
        note,
      });

      await ticket.save();

      const populatedTicket =
        await findPopulatedTicket(id);

      return res.status(200).json({
        success: true,
        message:
          "Internal note added successfully.",
        ticket: populatedTicket,
      });
    } catch (error) {
      console.error(
        "Add internal note error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to add internal note.",
      });
    }
  };