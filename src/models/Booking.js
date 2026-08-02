import crypto from "crypto";
import mongoose from "mongoose";

/* =====================================
   Generate booking reference
===================================== */

const generateBookingReference = () => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  const randomCode = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  return `HHS-${date}-${randomCode}`;
};

/* =====================================
   Guest schema
===================================== */

const guestSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    age: {
      type: Number,
      min: 0,
      max: 120,
    },

    gender: {
      type: String,
      enum: [
        "male",
        "female",
        "other",
        "prefer_not_to_say",
      ],
    },
  },
  {
    _id: false,
  }
);

/* =====================================
   Refund schema
===================================== */

const refundSchema = new mongoose.Schema(
  {
    razorpayRefundId: {
      type: String,
      required: true,
      trim: true,
    },

    amountInSubunits: {
      type: Number,
      required: true,
      min: 1,
    },

    currency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processed",
        "failed",
      ],
      default: "pending",
    },

    speedRequested: {
      type: String,
      default: "normal",
      trim: true,
    },

    speedProcessed: {
      type: String,
      default: "",
      trim: true,
    },

    reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    initiatedAt: {
      type: Date,
      default: Date.now,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: true,
  }
);

/* =====================================
   Booking schema
===================================== */

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: {
      type: String,
      unique: true,
      index: true,
      default: generateBookingReference,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    checkInDate: {
      type: Date,
      required: [
        true,
        "Check-in date is required.",
      ],
    },

    checkOutDate: {
      type: Date,
      required: [
        true,
        "Check-out date is required.",
      ],
    },

    numberOfNights: {
      type: Number,
      required: true,
      min: 1,
    },

    numberOfRooms: {
      type: Number,
      required: true,
      min: 1,
    },

    numberOfGuests: {
      type: Number,
      required: true,
      min: 1,
    },

    guests: {
      type: [guestSchema],
      default: [],
    },

    primaryGuest: {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },

      phone: {
        type: String,
        required: true,
        trim: true,
      },
    },

    priceDetails: {
      pricePerNight: {
        type: Number,
        required: true,
        min: 0,
      },

      roomTotal: {
        type: Number,
        required: true,
        min: 0,
      },

      serviceFee: {
        type: Number,
        default: 0,
        min: 0,
      },

      taxes: {
        type: Number,
        default: 0,
        min: 0,
      },

      discount: {
        type: Number,
        default: 0,
        min: 0,
      },

      grandTotal: {
        type: Number,
        required: true,
        min: 0,
      },
    },

    bookingStatus: {
      type: String,

      enum: [
        "pending",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
        "expired",
        "refund_pending",
        "refunded",
        "no_show",
      ],

      default: "pending",
      index: true,
    },

    /* =====================================
       Temporary room hold
    ===================================== */

    holdExpiresAt: {
      type: Date,

      default: () => {
        return new Date(
          Date.now() +
            15 * 60 * 1000
        );
      },

      index: true,
    },

    expiredAt: {
      type: Date,
      default: null,
    },

    paymentStatus: {
      type: String,

      enum: [
        "pending",
        "paid",
        "failed",
        "refund_pending",
        "partially_refunded",
        "refunded",
      ],

      default: "pending",
      index: true,
    },

    paymentMethod: {
      type: String,

      enum: [
        "online",
        "cash",
        "upi",
        "card",
        "bank_transfer",
        "not_selected",
      ],

      default: "not_selected",
    },

    paymentTransactionId: {
      type: String,
      trim: true,
      default: "",
    },

    /* =====================================
       Razorpay payment information
    ===================================== */

    payment: {
      provider: {
        type: String,

        enum: [
          "razorpay",
          "manual",
          "not_selected",
        ],

        default: "not_selected",
      },

      currency: {
        type: String,
        default: "INR",
        uppercase: true,
        trim: true,
      },

      amountInSubunits: {
        type: Number,
        default: 0,
        min: 0,
      },

      razorpayOrderId: {
        type: String,
        trim: true,
        default: undefined,
      },

      razorpayPaymentId: {
        type: String,
        trim: true,
        default: undefined,
      },

      razorpaySignature: {
        type: String,
        trim: true,
        default: "",
      },

      orderStatus: {
        type: String,

        enum: [
          "none",
          "created",
          "attempted",
          "paid",
        ],

        default: "none",
      },

      failureCode: {
        type: String,
        trim: true,
        default: "",
        maxlength: 100,
      },

      failureDescription: {
        type: String,
        trim: true,
        default: "",
        maxlength: 500,
      },

      orderCreatedAt: {
        type: Date,
        default: null,
      },

      paidAt: {
        type: Date,
        default: null,
      },

      failedAt: {
        type: Date,
        default: null,
      },

      processedWebhookEventIds: {
        type: [String],
        default: [],
      },
    },

    refunds: {
      type: [refundSchema],
      default: [],
    },

    specialRequests: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    cancellation: {
      requestedAt: {
        type: Date,
        default: null,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },

      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      reason: {
        type: String,
        trim: true,
        default: "",
      },

      refundAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    checkedInAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    internalNotes: [
      {
        note: {
          type: String,
          required: true,
          trim: true,
        },

        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

/* =====================================
   Validate booking dates
===================================== */

bookingSchema.pre(
  "validate",
  function validateBookingDates() {
    if (
      !this.checkInDate ||
      !this.checkOutDate
    ) {
      return;
    }

    const checkIn = new Date(
      this.checkInDate
    );

    const checkOut = new Date(
      this.checkOutDate
    );

    if (checkOut <= checkIn) {
      this.invalidate(
        "checkOutDate",
        "Check-out date must be after check-in date."
      );

      return;
    }

    this.numberOfNights = Math.ceil(
      (checkOut.getTime() -
        checkIn.getTime()) /
        (1000 * 60 * 60 * 24)
    );
  }
);

/* =====================================
   Expire unpaid room holds
===================================== */

bookingSchema.statics.expireStaleHolds =
  function expireStaleHolds(
    now = new Date()
  ) {
    const legacyCutoff = new Date(
      now.getTime() -
        15 * 60 * 1000
    );

    return this.updateMany(
      {
        bookingStatus: "pending",

        paymentStatus: {
          $in: [
            "pending",
            "failed",
          ],
        },

        $or: [
          {
            holdExpiresAt: {
              $ne: null,
              $lte: now,
            },
          },

          {
            holdExpiresAt: {
              $exists: false,
            },

            createdAt: {
              $lte: legacyCutoff,
            },
          },

          {
            holdExpiresAt: null,

            createdAt: {
              $lte: legacyCutoff,
            },
          },
        ],
      },
      {
        $set: {
          bookingStatus: "expired",
          expiredAt: now,
        },
      }
    );
  };

/* =====================================
   Booking indexes
===================================== */

bookingSchema.index({
  customer: 1,
  createdAt: -1,
});

bookingSchema.index({
  owner: 1,
  createdAt: -1,
});

bookingSchema.index({
  property: 1,
  checkInDate: 1,
  checkOutDate: 1,
});

bookingSchema.index({
  bookingStatus: 1,
  paymentStatus: 1,
});

bookingSchema.index({
  bookingStatus: 1,
  paymentStatus: 1,
  holdExpiresAt: 1,
});

bookingSchema.index({
  checkInDate: 1,
  checkOutDate: 1,
});

bookingSchema.index(
  {
    "payment.razorpayOrderId": 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      "payment.razorpayOrderId": {
        $type: "string",
      },
    },
  }
);

bookingSchema.index(
  {
    "payment.razorpayPaymentId": 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      "payment.razorpayPaymentId": {
        $type: "string",
      },
    },
  }
);

bookingSchema.index(
  {
    "refunds.razorpayRefundId": 1,
  },
  {
    sparse: true,
  }
);

const Booking = mongoose.model(
  "Booking",
  bookingSchema
);

export default Booking;