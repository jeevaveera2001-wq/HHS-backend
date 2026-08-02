import crypto from "crypto";
import mongoose from "mongoose";

/* =====================================
   Generate ticket reference
===================================== */

const generateTicketReference = () => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  const randomCode = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  return `HHS-TKT-${date}-${randomCode}`;
};

/* =====================================
   Ticket message schema
===================================== */

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },

    attachments: [
      {
        url: {
          type: String,
          required: true,
        },

        fileName: {
          type: String,
          trim: true,
          default: "",
        },

        publicId: {
          type: String,
          trim: true,
          default: "",
        },
      },
    ],

    isStaffReply: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* =====================================
   Internal support note
===================================== */

const internalNoteSchema =
  new mongoose.Schema(
    {
      note: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000,
      },

      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
    {
      timestamps: true,
    }
  );

/* =====================================
   Support ticket schema
===================================== */

const supportTicketSchema =
  new mongoose.Schema(
    {
      ticketReference: {
        type: String,
        unique: true,
        index: true,
        default: generateTicketReference,
      },

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      userType: {
        type: String,
        enum: [
          "customer",
          "owner",
        ],
        required: true,
      },

      subject: {
        type: String,
        required: [
          true,
          "Ticket subject is required.",
        ],
        trim: true,
        minlength: 5,
        maxlength: 200,
      },

      description: {
        type: String,
        required: [
          true,
          "Ticket description is required.",
        ],
        trim: true,
        minlength: 10,
        maxlength: 5000,
      },

      category: {
        type: String,

        enum: [
          "booking",
          "payment",
          "refund",
          "property",
          "owner_verification",
          "account",
          "technical",
          "complaint",
          "general",
        ],

        default: "general",
        index: true,
      },

      priority: {
        type: String,

        enum: [
          "low",
          "medium",
          "high",
          "urgent",
        ],

        default: "medium",
        index: true,
      },

      status: {
        type: String,

        enum: [
          "open",
          "assigned",
          "waiting_for_customer",
          "waiting_for_owner",
          "escalated",
          "resolved",
          "closed",
        ],

        default: "open",
        index: true,
      },

      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
      },

      relatedBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
        default: null,
      },

      relatedProperty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Property",
        default: null,
      },

      relatedOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      messages: {
        type: [messageSchema],
        default: [],
      },

      internalNotes: {
        type: [internalNoteSchema],
        default: [],
      },

      escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      escalationReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },

      resolvedAt: {
        type: Date,
        default: null,
      },

      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      closedAt: {
        type: Date,
        default: null,
      },

      lastActivityAt: {
        type: Date,
        default: Date.now,
        index: true,
      },
    },
    {
      timestamps: true,
    }
  );

/* =====================================
   Keep last activity updated
===================================== */

supportTicketSchema.pre("save", function () {
  if (
    this.isModified("messages") ||
    this.isModified("status") ||
    this.isModified("assignedTo")
  ) {
    this.lastActivityAt = new Date();
  }
});

/* =====================================
   Support ticket indexes
===================================== */

supportTicketSchema.index({
  createdBy: 1,
  createdAt: -1,
});

supportTicketSchema.index({
  assignedTo: 1,
  status: 1,
});

supportTicketSchema.index({
  status: 1,
  priority: 1,
  lastActivityAt: -1,
});

supportTicketSchema.index({
  category: 1,
  createdAt: -1,
});

const SupportTicket = mongoose.model(
  "SupportTicket",
  supportTicketSchema
);

export default SupportTicket;