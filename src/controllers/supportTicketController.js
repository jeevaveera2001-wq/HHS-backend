import mongoose from "mongoose";

import SupportTicket from "../models/SupportTicket.js";
import User from "../models/User.js";

/* =====================================
   Support-ticket constants
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
  "assigned",
  "waiting_for_customer",
  "waiting_for_owner",
  "escalated",
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
  "booking",
  "payment",
  "refund",
  "property",
  "owner_verification",
  "account",
  "technical",
  "complaint",
  "general",
];

/* =====================================
   Helper functions
===================================== */

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
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

const isTicketOwner = (ticket, user) => {
  const ticketUserId = getDocumentId(
    ticket.createdBy
  );

  const currentUserId = getDocumentId(user);

  if (!ticketUserId || !currentUserId) {
    return false;
  }

  return (
    String(ticketUserId) ===
    String(currentUserId)
  );
};

const canAccessTicket = (ticket, user) => {
  return (
    isSupportStaff(user) ||
    isTicketOwner(ticket, user)
  );
};

const escapeRegularExpression = (value) => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

const getPaginationValues = (query) => {
  const page = Math.max(
    Number.parseInt(query.page, 10) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number.parseInt(query.limit, 10) || 10,
      1
    ),
    100
  );

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
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
      path: "relatedOwner",
      select:
        "fullName email phone role profileImage",
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
      path: "escalatedTo",
      select:
        "fullName email phone role profileImage",
    },
    {
      path: "resolvedBy",
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

export const createSupportTicket = async (
  req,
  res
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required. Please login again.",
      });
    }

    if (
      !["customer", "owner"].includes(
        req.user.role
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only customers and property owners can create support tickets.",
      });
    }

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

    const relatedOwner =
      req.body.relatedOwner || null;

    const attachments = Array.isArray(
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

    if (subject.length > 200) {
      return res.status(400).json({
        success: false,
        message:
          "Subject cannot exceed 200 characters.",
      });
    }

    if (description.length < 10) {
      return res.status(400).json({
        success: false,
        message:
          "Description must contain at least 10 characters.",
      });
    }

    if (description.length > 5000) {
      return res.status(400).json({
        success: false,
        message:
          "Description cannot exceed 5000 characters.",
      });
    }

    if (
      !TICKET_CATEGORIES.includes(category)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid support-ticket category.",
      });
    }

    if (
      !TICKET_PRIORITIES.includes(priority)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid support-ticket priority.",
      });
    }

    if (
      relatedBooking &&
      !isValidObjectId(relatedBooking)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid related booking ID.",
      });
    }

    if (
      relatedProperty &&
      !isValidObjectId(relatedProperty)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid related property ID.",
      });
    }

    if (
      relatedOwner &&
      !isValidObjectId(relatedOwner)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid related owner ID.",
      });
    }

    const initialMessages = [];

    if (attachments.length > 0) {
      initialMessages.push({
        sender: req.user._id,
        message: description,
        attachments,
        isStaffReply: false,
      });
    }

    const ticket =
      await SupportTicket.create({
        createdBy: req.user._id,

        // Required by SupportTicket model
        userType: req.user.role,

        subject,
        description,
        category,
        priority,
        status: "open",

        relatedBooking,
        relatedProperty,
        relatedOwner,

        messages: initialMessages,
        lastActivityAt: new Date(),
      });

    const populatedTicket =
      await findPopulatedTicket(ticket._id);

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

    if (error.name === "ValidationError") {
      const validationMessage =
        Object.values(error.errors)
          .map((item) => item.message)
          .join(" ");

      return res.status(400).json({
        success: false,
        message:
          validationMessage ||
          "Support-ticket validation failed.",
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid support-ticket information.",
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Ticket reference already exists. Please submit again.",
      });
    }

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

export const getMySupportTickets = async (
  req,
  res
) => {
  try {
    const {
      status,
      priority,
      category,
      search,
    } = req.query;

    const { page, limit, skip } =
      getPaginationValues(req.query);

    const filter = {
      createdBy: req.user._id,
    };

    if (status) {
      if (!TICKET_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid ticket status.",
        });
      }

      filter.status = status;
    }

    if (priority) {
      if (
        !TICKET_PRIORITIES.includes(priority)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid ticket priority.",
        });
      }

      filter.priority = priority;
    }

    if (category) {
      if (
        !TICKET_CATEGORIES.includes(category)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid ticket category.",
        });
      }

      filter.category = category;
    }

    if (search?.trim()) {
      const safeSearch =
        escapeRegularExpression(
          search.trim()
        );

      filter.$or = [
        {
          ticketReference: {
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

    const [tickets, totalTickets] =
      await Promise.all([
        populateTicketQuery(
          SupportTicket.find(filter)
        )
          .sort({
            lastActivityAt: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit),

        SupportTicket.countDocuments(filter),
      ]);

    return res.status(200).json({
      success: true,
      count: tickets.length,
      totalTickets,
      currentPage: page,
      totalPages: Math.ceil(
        totalTickets / limit
      ),
      tickets,
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
   Get assignable support staff
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
          "_id fullName email phone role profileImage isActive"
        )
        .sort({
          role: 1,
          fullName: 1,
        });

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

      const { page, limit, skip } =
        getPaginationValues(req.query);

      const filter = {};

      if (status) {
        if (
          !TICKET_STATUSES.includes(status)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid ticket status.",
          });
        }

        filter.status = status;
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

        filter.priority = priority;
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

        filter.category = category;
      }

      if (assignedTo) {
        if (assignedTo === "unassigned") {
          filter.assignedTo = null;
        } else {
          if (
            !isValidObjectId(assignedTo)
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid assigned staff ID.",
            });
          }

          filter.assignedTo = assignedTo;
        }
      }

      if (search?.trim()) {
        const safeSearch =
          escapeRegularExpression(
            search.trim()
          );

        filter.$or = [
          {
            ticketReference: {
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

      const [tickets, totalTickets] =
        await Promise.all([
          populateTicketQuery(
            SupportTicket.find(filter)
          )
            .sort({
              priority: -1,
              lastActivityAt: -1,
              createdAt: -1,
            })
            .skip(skip)
            .limit(limit),

          SupportTicket.countDocuments(
            filter
          ),
        ]);

      return res.status(200).json({
        success: true,
        count: tickets.length,
        totalTickets,
        currentPage: page,
        totalPages: Math.ceil(
          totalTickets / limit
        ),
        tickets,
      });
    } catch (error) {
      console.error(
        "Get managed support tickets error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load managed support tickets.",
      });
    }
  };

/* =====================================
   Get one support ticket
===================================== */

export const getSupportTicketById =
  async (req, res) => {
    try {
      const { id } = req.params;

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
        !canAccessTicket(ticket, req.user)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have permission to view this support ticket.",
        });
      }

      const ticketResponse =
        ticket.toObject();

      if (!isSupportStaff(req.user)) {
        delete ticketResponse.internalNotes;
      }

      return res.status(200).json({
        success: true,
        ticket: ticketResponse,
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
      const { id } = req.params;

      const message =
        req.body.message?.trim();

      const attachments = Array.isArray(
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

      if (message.length > 3000) {
        return res.status(400).json({
          success: false,
          message:
            "Reply message cannot exceed 3000 characters.",
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
        !canAccessTicket(ticket, req.user)
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
        message,
        attachments,
        isStaffReply: staffReply,
      });

      if (
        staffReply &&
        ticket.status === "open"
      ) {
        ticket.status = "assigned";
      }

      if (
        !staffReply &&
        ticket.status ===
          "waiting_for_customer"
      ) {
        ticket.status = "open";
      }

      if (
        !staffReply &&
        ticket.status ===
          "waiting_for_owner"
      ) {
        ticket.status = "open";
      }

      ticket.lastActivityAt = new Date();

      await ticket.save();

      const populatedTicket =
        await findPopulatedTicket(id);

      return res.status(200).json({
        success: true,
        message:
          "Reply added successfully.",
        ticket: populatedTicket,
      });
    } catch (error) {
      console.error(
        "Reply to support ticket error:",
        error
      );

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Unable to add support-ticket reply.",
      });
    }
  };

/* =====================================
   Assign support ticket
===================================== */

export const assignSupportTicket =
  async (req, res) => {
    try {
      const { id } = req.params;
      const { assignedTo } = req.body;

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

      if (
        assignedTo === null ||
        assignedTo === "" ||
        assignedTo === undefined
      ) {
        ticket.assignedTo = null;

        if (ticket.status === "assigned") {
          ticket.status = "open";
        }

        ticket.lastActivityAt = new Date();

        await ticket.save();

        const populatedTicket =
          await findPopulatedTicket(id);

        return res.status(200).json({
          success: true,
          message:
            "Support ticket unassigned successfully.",
          ticket: populatedTicket,
        });
      }

      if (!isValidObjectId(assignedTo)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid support staff ID.",
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

      if (ticket.status === "open") {
        ticket.status = "assigned";
      }

      ticket.lastActivityAt = new Date();

      await ticket.save();

      const populatedTicket =
        await findPopulatedTicket(id);

      return res.status(200).json({
        success: true,
        message: `Ticket assigned to ${staffMember.fullName}.`,
        ticket: populatedTicket,
      });
    } catch (error) {
      console.error(
        "Assign support ticket error:",
        error
      );

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Unable to assign support ticket.",
      });
    }
  };

/* =====================================
   Update support ticket
===================================== */

export const updateSupportTicket =
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        status,
        priority,
        category,
        escalationReason,
        escalatedTo,
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
          !TICKET_STATUSES.includes(status)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid ticket status.",
          });
        }

        ticket.status = status;

        if (status === "resolved") {
          ticket.resolvedAt = new Date();
          ticket.resolvedBy = req.user._id;
        } else {
          ticket.resolvedAt = null;
          ticket.resolvedBy = null;
        }

        if (status === "closed") {
          ticket.closedAt = new Date();
        } else {
          ticket.closedAt = null;
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

      if (
        escalationReason !== undefined
      ) {
        const cleanedReason =
          escalationReason?.trim() || "";

        if (cleanedReason.length > 1000) {
          return res.status(400).json({
            success: false,
            message:
              "Escalation reason cannot exceed 1000 characters.",
          });
        }

        ticket.escalationReason =
          cleanedReason;
      }

      if (escalatedTo !== undefined) {
        if (
          escalatedTo &&
          !isValidObjectId(escalatedTo)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid escalation staff ID.",
          });
        }

        ticket.escalatedTo =
          escalatedTo || null;
      }

      ticket.lastActivityAt = new Date();

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

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

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

export const addInternalNote = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const note = req.body.note?.trim();

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

    if (note.length > 2000) {
      return res.status(400).json({
        success: false,
        message:
          "Internal note cannot exceed 2000 characters.",
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

    ticket.lastActivityAt = new Date();

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

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to add internal note.",
    });
  }
};