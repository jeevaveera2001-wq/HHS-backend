import crypto from "crypto";
import mongoose from "mongoose";

const SETTLEMENT_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "queued",
  "pending",
  "processing",
  "processed",
  "failed",
  "rejected",
  "cancelled",
  "reversed",
];

const PAYOUT_MODES = [
  "NEFT",
  "RTGS",
  "IMPS",
  "UPI",
];

/* =====================================
   Generate settlement reference
===================================== */

const generateSettlementReference = () => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  const randomCode = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  return `HHS-STL-${date}-${randomCode}`;
};

/* =====================================
   Amount validator

   All financial values are stored
   as integer paise values.
===================================== */

const isNonNegativeInteger = {
  validator(value) {
    return (
      Number.isInteger(value) &&
      value >= 0
    );
  },

  message:
    "Settlement amounts must be non-negative integer values in paise.",
};

/* =====================================
   Booking entry schema
===================================== */

const bookingEntrySchema =
  new mongoose.Schema(
    {
      booking: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "Booking",
        required: true,
      },

      property: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "Property",
        required: true,
      },

      bookingReference: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      completedAt: {
        type: Date,
        required: true,
      },

      grossAmountInSubunits: {
        type: Number,
        required: true,
        min: 0,
        validate:
          isNonNegativeInteger,
      },

      refundedAmountInSubunits: {
        type: Number,
        default: 0,
        min: 0,
        validate:
          isNonNegativeInteger,
      },

      commissionableAmountInSubunits:
        {
          type: Number,
          required: true,
          min: 0,
          validate:
            isNonNegativeInteger,
        },

      platformCommissionRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },

      platformCommissionInSubunits:
        {
          type: Number,
          required: true,
          min: 0,
          validate:
            isNonNegativeInteger,
        },

      ownerEarningsInSubunits: {
        type: Number,
        required: true,
        min: 0,
        validate:
          isNonNegativeInteger,
      },

      currency: {
        type: String,
        enum: ["INR"],
        default: "INR",
        uppercase: true,
        trim: true,
      },
    },
    {
      _id: true,
    }
  );

/* =====================================
   Settlement adjustment schema
===================================== */

const adjustmentSchema =
  new mongoose.Schema(
    {
      description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
      },

      amountInSubunits: {
        type: Number,
        required: true,

        validate: {
          validator(value) {
            return Number.isInteger(
              value
            );
          },

          message:
            "Adjustment amounts must be integer values in paise.",
        },
      },

      addedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
      },

      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      _id: true,
    }
  );

/* =====================================
   Settlement history schema
===================================== */

const settlementHistorySchema =
  new mongoose.Schema(
    {
      action: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },

      status: {
        type: String,
        enum:
          SETTLEMENT_STATUSES,
        required: true,
      },

      note: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },

      changedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "User",
        default: null,
      },

      source: {
        type: String,

        enum: [
          "system",
          "owner",
          "admin",
          "razorpay",
          "webhook",
        ],

        default: "system",
      },

      changedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      _id: true,
    }
  );

/* =====================================
   Owner settlement schema
===================================== */

const ownerSettlementSchema =
  new mongoose.Schema(
    {
      settlementReference: {
        type: String,
        unique: true,
        index: true,
        default:
          generateSettlementReference,
      },

      owner: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      payoutAccount: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref:
          "OwnerPayoutAccount",
        required: true,
        index: true,
      },

      /* Keep a masked snapshot in case
         the owner later changes account. */

      payoutAccountSnapshot: {
        payoutMethod: {
          type: String,

          enum: [
            "bank_account",
            "upi",
          ],

          required: true,
        },

        accountHolderName: {
          type: String,
          trim: true,
          maxlength: 150,
          default: "",
        },

        maskedDestination: {
          type: String,
          required: true,
          trim: true,
          maxlength: 150,
        },

        bankName: {
          type: String,
          trim: true,
          maxlength: 150,
          default: "",
        },

        ifsc: {
          type: String,
          trim: true,
          uppercase: true,
          maxlength: 20,
          default: "",
        },
      },

      periodStart: {
        type: Date,
        required: true,
        index: true,
      },

      periodEnd: {
        type: Date,
        required: true,
        index: true,
      },

      bookingEntries: {
        type:
          [bookingEntrySchema],
        default: [],

        validate: {
          validator(entries) {
            return (
              Array.isArray(
                entries
              ) &&
              entries.length > 0
            );
          },

          message:
            "A settlement must contain at least one booking.",
        },
      },

      adjustments: {
        type: [adjustmentSchema],
        default: [],
      },

      totals: {
        grossAmountInSubunits: {
          type: Number,
          default: 0,
          min: 0,
          validate:
            isNonNegativeInteger,
        },

        refundedAmountInSubunits:
          {
            type: Number,
            default: 0,
            min: 0,
            validate:
              isNonNegativeInteger,
          },

        commissionableAmountInSubunits:
          {
            type: Number,
            default: 0,
            min: 0,
            validate:
              isNonNegativeInteger,
          },

        platformCommissionInSubunits:
          {
            type: Number,
            default: 0,
            min: 0,
            validate:
              isNonNegativeInteger,
          },

        ownerEarningsInSubunits:
          {
            type: Number,
            default: 0,
            min: 0,
            validate:
              isNonNegativeInteger,
          },

        adjustmentAmountInSubunits:
          {
            type: Number,
            default: 0,

            validate: {
              validator(value) {
                return Number.isInteger(
                  value
                );
              },

              message:
                "The total adjustment must be an integer value in paise.",
            },
          },

        withholdingTaxInSubunits:
          {
            type: Number,
            default: 0,
            min: 0,
            validate:
              isNonNegativeInteger,
          },

        netPayoutInSubunits: {
          type: Number,
          default: 0,
          min: 0,
          validate:
            isNonNegativeInteger,
        },
      },

      currency: {
        type: String,
        enum: ["INR"],
        default: "INR",
        uppercase: true,
        trim: true,
      },

      status: {
        type: String,
        enum:
          SETTLEMENT_STATUSES,
        default: "draft",
        index: true,
      },

      payoutMode: {
        type: String,
        enum: PAYOUT_MODES,
        default: "IMPS",
      },

      /* RazorpayX payout information */

      payout: {
        provider: {
          type: String,

          enum: [
            "razorpayx",
            "manual",
            "not_started",
          ],

          default:
            "not_started",
        },

        razorpayPayoutId: {
          type: String,
          trim: true,
          default: undefined,
        },

        idempotencyKey: {
          type: String,
          trim: true,
          select: false,
          default: undefined,
        },

        providerStatus: {
          type: String,

          enum: [
            "not_started",
            "queued",
            "pending",
            "processing",
            "processed",
            "failed",
            "rejected",
            "cancelled",
            "reversed",
          ],

          default:
            "not_started",
        },

        utr: {
          type: String,
          trim: true,
          maxlength: 150,
          default: "",
        },

        feesInSubunits: {
          type: Number,
          default: 0,
          min: 0,
          validate:
            isNonNegativeInteger,
        },

        taxInSubunits: {
          type: Number,
          default: 0,
          min: 0,
          validate:
            isNonNegativeInteger,
        },

        failureCode: {
          type: String,
          trim: true,
          maxlength: 150,
          default: "",
        },

        failureReason: {
          type: String,
          trim: true,
          maxlength: 1000,
          default: "",
        },

        statusDetails: {
          source: {
            type: String,
            trim: true,
            maxlength: 100,
            default: "",
          },

          reason: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
          },

          description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
          },
        },

        initiatedAt: {
          type: Date,
          default: null,
        },

        processedAt: {
          type: Date,
          default: null,
        },

        failedAt: {
          type: Date,
          default: null,
        },

        reversedAt: {
          type: Date,
          default: null,
        },

        lastProviderSyncAt: {
          type: Date,
          default: null,
        },
      },

      approval: {
        requestedAt: {
          type: Date,
          default: null,
        },

        approvedAt: {
          type: Date,
          default: null,
        },

        approvedBy: {
          type:
            mongoose.Schema.Types
              .ObjectId,
          ref: "User",
          default: null,
        },

        rejectedAt: {
          type: Date,
          default: null,
        },

        rejectedBy: {
          type:
            mongoose.Schema.Types
              .ObjectId,
          ref: "User",
          default: null,
        },

        rejectionReason: {
          type: String,
          trim: true,
          maxlength: 1000,
          default: "",
        },
      },

      notes: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: "",
      },

      history: {
        type:
          [settlementHistorySchema],
        default: [],
      },

      createdBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "User",
        default: null,
      },
    },
    {
      timestamps: true,

      toJSON: {
        virtuals: true,
      },

      toObject: {
        virtuals: true,
      },
    }
  );

/* =====================================
   Settlement virtual fields
===================================== */

ownerSettlementSchema
  .virtual("bookingCount")
  .get(
    function getBookingCount() {
      return this.bookingEntries
        .length;
    }
  );

ownerSettlementSchema
  .virtual("netPayout")
  .get(
    function getNetPayout() {
      return (
        Number(
          this.totals
            ?.netPayoutInSubunits ||
            0
        ) / 100
      );
    }
  );

/* =====================================
   Recalculate settlement totals
===================================== */

ownerSettlementSchema.methods.recalculateTotals =
  function recalculateTotals() {
    const entries =
      this.bookingEntries || [];

    const adjustments =
      this.adjustments || [];

    const sumEntries = (
      field
    ) => {
      return entries.reduce(
        (total, entry) => {
          return (
            total +
            Number(
              entry[field] || 0
            )
          );
        },
        0
      );
    };

    const adjustmentTotal =
      adjustments.reduce(
        (
          total,
          adjustment
        ) => {
          return (
            total +
            Number(
              adjustment
                .amountInSubunits ||
                0
            )
          );
        },
        0
      );

    const withholdingTax =
      Number(
        this.totals
          ?.withholdingTaxInSubunits ||
          0
      );

    const ownerEarnings =
      sumEntries(
        "ownerEarningsInSubunits"
      );

    const netPayout =
      ownerEarnings +
      adjustmentTotal -
      withholdingTax;

    this.totals.grossAmountInSubunits =
      sumEntries(
        "grossAmountInSubunits"
      );

    this.totals.refundedAmountInSubunits =
      sumEntries(
        "refundedAmountInSubunits"
      );

    this.totals.commissionableAmountInSubunits =
      sumEntries(
        "commissionableAmountInSubunits"
      );

    this.totals.platformCommissionInSubunits =
      sumEntries(
        "platformCommissionInSubunits"
      );

    this.totals.ownerEarningsInSubunits =
      ownerEarnings;

    this.totals.adjustmentAmountInSubunits =
      adjustmentTotal;

    this.totals.netPayoutInSubunits =
      Math.max(
        Math.round(netPayout),
        0
      );

    return this.totals;
  };

/* =====================================
   Add settlement history
===================================== */

ownerSettlementSchema.methods.addHistory =
  function addHistory({
    action,
    status = this.status,
    note = "",
    changedBy = null,
    source = "system",
  }) {
    this.history.push({
      action,
      status,
      note,
      changedBy,
      source,
      changedAt: new Date(),
    });
  };

/* =====================================
   Settlement validation
===================================== */

ownerSettlementSchema.pre(
  "validate",
  function validateSettlement() {
    if (
      this.periodStart &&
      this.periodEnd &&
      this.periodEnd <
        this.periodStart
    ) {
      this.invalidate(
        "periodEnd",
        "Settlement period end must be on or after its start date."
      );
    }

    const bookingIds = (
      this.bookingEntries || []
    )
      .map((entry) => {
        return entry.booking?.toString();
      })
      .filter(Boolean);

    if (
      new Set(bookingIds).size !==
      bookingIds.length
    ) {
      this.invalidate(
        "bookingEntries",
        "A booking cannot appear more than once in the same settlement."
      );
    }

    (
      this.bookingEntries || []
    ).forEach(
      (entry, index) => {
        const grossAmount =
          Number(
            entry.grossAmountInSubunits ||
              0
          );

        const refundedAmount =
          Number(
            entry.refundedAmountInSubunits ||
              0
          );

        const commissionableAmount =
          Number(
            entry.commissionableAmountInSubunits ||
              0
          );

        const commissionRate =
          Number(
            entry.platformCommissionRate ||
              0
          );

        const platformCommission =
          Number(
            entry.platformCommissionInSubunits ||
              0
          );

        const ownerEarnings =
          Number(
            entry.ownerEarningsInSubunits ||
              0
          );

        const eligibleAmount =
          Math.max(
            grossAmount -
              refundedAmount,
            0
          );

        if (
          refundedAmount >
          grossAmount
        ) {
          this.invalidate(
            `bookingEntries.${index}.refundedAmountInSubunits`,
            "Refunded amount cannot exceed the booking gross amount."
          );
        }

        if (
          commissionableAmount >
          eligibleAmount
        ) {
          this.invalidate(
            `bookingEntries.${index}.commissionableAmountInSubunits`,
            "Commissionable amount cannot exceed the booking amount remaining after refunds."
          );
        }

        const expectedCommission =
          Math.round(
            commissionableAmount *
              (commissionRate /
                100)
          );

        if (
          platformCommission !==
          expectedCommission
        ) {
          this.invalidate(
            `bookingEntries.${index}.platformCommissionInSubunits`,
            "Platform commission does not match the configured commission rate."
          );
        }

        const expectedOwnerEarnings =
          Math.max(
            commissionableAmount -
              platformCommission,
            0
          );

        if (
          ownerEarnings !==
          expectedOwnerEarnings
        ) {
          this.invalidate(
            `bookingEntries.${index}.ownerEarningsInSubunits`,
            "Owner earnings must equal the commissionable amount minus platform commission."
          );
        }
      }
    );

    this.recalculateTotals();

    if (
      [
        "approved",
        "queued",
        "pending",
        "processing",
        "processed",
      ].includes(this.status) &&
      this.totals
        .netPayoutInSubunits <
        100
    ) {
      this.invalidate(
        "totals.netPayoutInSubunits",
        "Approved settlements must have a net payout of at least one rupee."
      );
    }
  }
);

/* =====================================
   Settlement indexes
===================================== */

ownerSettlementSchema.index({
  owner: 1,
  status: 1,
  createdAt: -1,
});

ownerSettlementSchema.index({
  status: 1,
  periodEnd: -1,
});

ownerSettlementSchema.index({
  payoutAccount: 1,
  createdAt: -1,
});

/* Prevent a completed booking from
   being added to multiple settlements. */

ownerSettlementSchema.index(
  {
    "bookingEntries.booking": 1,
  },
  {
    unique: true,
  }
);

ownerSettlementSchema.index(
  {
    "payout.razorpayPayoutId": 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      "payout.razorpayPayoutId":
        {
          $type: "string",
        },
    },
  }
);

const OwnerSettlement =
  mongoose.model(
    "OwnerSettlement",
    ownerSettlementSchema
  );

export {
  PAYOUT_MODES,
  SETTLEMENT_STATUSES,
};

export default OwnerSettlement;