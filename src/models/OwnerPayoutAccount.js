import mongoose from "mongoose";

/* =====================================
   Bank account information

   Important:
   Never store the complete bank account
   number in MongoDB.

   Only the final four digits are stored
   for displaying masked information.
===================================== */

const bankDetailsSchema =
  new mongoose.Schema(
    {
      accountHolderName: {
        type: String,
        required: [
          true,
          "Account holder name is required.",
        ],
        trim: true,
        minlength: [
          2,
          "Account holder name is too short.",
        ],
        maxlength: [
          120,
          "Account holder name is too long.",
        ],
      },

      accountNumberLast4: {
        type: String,
        required: [
          true,
          "Account number information is required.",
        ],
        trim: true,
        match: [
          /^\d{4}$/,
          "Account number must contain at least four digits.",
        ],
      },

      ifsc: {
        type: String,
        required: [
          true,
          "IFSC code is required.",
        ],
        trim: true,
        uppercase: true,
        match: [
          /^[A-Z]{4}0[A-Z0-9]{6}$/,
          "Please provide a valid IFSC code.",
        ],
      },

      bankName: {
        type: String,
        trim: true,
        maxlength: [
          120,
          "Bank name is too long.",
        ],
        default: "",
      },

      branchName: {
        type: String,
        trim: true,
        maxlength: [
          150,
          "Branch name is too long.",
        ],
        default: "",
      },

      accountType: {
        type: String,
        enum: [
          "savings",
          "current",
        ],
        default: "savings",
      },
    },
    {
      _id: false,
    }
  );

/* =====================================
   UPI payout information

   Store only a masked display value.
   Razorpay fundAccountId is used for
   the actual payout.
===================================== */

const upiDetailsSchema =
  new mongoose.Schema(
    {
      maskedVpa: {
        type: String,
        trim: true,
        maxlength: 150,
        default: "",
      },
    },
    {
      _id: false,
    }
  );

/* =====================================
   Verification history
===================================== */

const verificationHistorySchema =
  new mongoose.Schema(
    {
      action: {
        type: String,
        required: true,
        enum: [
          "submitted",
          "resubmitted",
          "under_review",
          "verified",
          "rejected",
          "enabled",
          "disabled",
          "provider_created",
          "provider_updated",
        ],
      },

      status: {
        type: String,
        required: true,
        enum: [
          "not_submitted",
          "pending",
          "under_review",
          "verified",
          "rejected",
          "disabled",
        ],
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
   Owner payout account schema
===================================== */

const ownerPayoutAccountSchema =
  new mongoose.Schema(
    {
      owner: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "User",
        required: [
          true,
          "Property owner is required.",
        ],
        unique: true,
        index: true,
      },

      payoutMethod: {
        type: String,
        enum: [
          "bank_account",
          "upi",
        ],
        default: "bank_account",
        required: true,
      },

      bankDetails: {
        type: bankDetailsSchema,
        default: undefined,
      },

      upiDetails: {
        type: upiDetailsSchema,
        default: undefined,
      },

      /* =================================
         Razorpay provider identifiers

         These values are excluded from
         normal queries using select:false.
      ================================= */

      razorpay: {
        linkedAccountId: {
          type: String,
          trim: true,
          default: "",
          select: false,
        },

        contactId: {
          type: String,
          trim: true,
          default: "",
          select: false,
        },

        fundAccountId: {
          type: String,
          trim: true,
          default: "",
          select: false,
        },

        stakeholderId: {
          type: String,
          trim: true,
          default: "",
          select: false,
        },

        productConfigurationId: {
          type: String,
          trim: true,
          default: "",
          select: false,
        },

        providerReference: {
          type: String,
          trim: true,
          default: "",
          select: false,
        },

        providerStatus: {
          type: String,
          enum: [
            "not_created",
            "created",
            "verification_pending",
            "activated",
            "suspended",
            "failed",
          ],
          default: "not_created",
        },

        lastProviderSyncAt: {
          type: Date,
          default: null,
        },

        providerError: {
          type: String,
          trim: true,
          maxlength: 1000,
          default: "",
          select: false,
        },
      },

      /* =================================
         Verification status
      ================================= */

      verificationStatus: {
        type: String,
        enum: [
          "not_submitted",
          "pending",
          "under_review",
          "verified",
          "rejected",
          "disabled",
        ],
        default: "not_submitted",
        required: true,
        index: true,
      },

      payoutsEnabled: {
        type: Boolean,
        default: false,
        index: true,
      },

      isPrimary: {
        type: Boolean,
        default: true,
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      reviewedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "User",
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      rejectedAt: {
        type: Date,
        default: null,
      },

      rejectionReason: {
        type: String,
        trim: true,
        maxlength: [
          1000,
          "Rejection reason is too long.",
        ],
        default: "",
      },

      adminNote: {
        type: String,
        trim: true,
        maxlength: [
          1000,
          "Administrative note is too long.",
        ],
        default: "",
      },

      verificationReference: {
        type: String,
        trim: true,
        maxlength: 200,
        default: "",
      },

      verificationHistory: {
        type: [
          verificationHistorySchema,
        ],
        default: [],
      },
    },
    {
      timestamps: true,

      optimisticConcurrency: true,

      toJSON: {
        virtuals: true,
      },

      toObject: {
        virtuals: true,
      },
    }
  );

/* =====================================
   Conditional validation

   Bank accounts require bank details.
   UPI accounts require a masked VPA.

   This middleware executes only during
   document validation.
===================================== */

ownerPayoutAccountSchema.pre(
  "validate",
  function () {
    if (
      this.payoutMethod ===
      "bank_account"
    ) {
      if (!this.bankDetails) {
        this.invalidate(
          "bankDetails",
          "Bank account details are required."
        );

        return;
      }

      if (
        !this.bankDetails
          .accountHolderName
      ) {
        this.invalidate(
          "bankDetails.accountHolderName",
          "Account holder name is required."
        );
      }

      if (
        !this.bankDetails
          .accountNumberLast4
      ) {
        this.invalidate(
          "bankDetails.accountNumberLast4",
          "Account number information is required."
        );
      }

      if (!this.bankDetails.ifsc) {
        this.invalidate(
          "bankDetails.ifsc",
          "IFSC code is required."
        );
      }
    }

    if (
      this.payoutMethod === "upi"
    ) {
      if (
        !this.upiDetails
          ?.maskedVpa
      ) {
        this.invalidate(
          "upiDetails.maskedVpa",
          "UPI information is required."
        );
      }
    }
  }
);

/* =====================================
   Verification timestamp management
===================================== */

ownerPayoutAccountSchema.pre(
  "save",
  function () {
    if (
      !this.isModified(
        "verificationStatus"
      )
    ) {
      return;
    }

    const currentDate =
      new Date();

    if (
      this.verificationStatus ===
      "pending"
    ) {
      this.submittedAt =
        this.submittedAt ||
        currentDate;

      this.reviewedAt = null;
      this.verifiedAt = null;
      this.rejectedAt = null;
      this.rejectionReason = "";
      this.payoutsEnabled = false;
    }

    if (
      this.verificationStatus ===
      "under_review"
    ) {
      this.reviewedAt =
        currentDate;

      this.payoutsEnabled = false;
    }

    if (
      this.verificationStatus ===
      "verified"
    ) {
      this.reviewedAt =
        currentDate;

      this.verifiedAt =
        currentDate;

      this.rejectedAt = null;
      this.rejectionReason = "";
      this.payoutsEnabled = true;
    }

    if (
      this.verificationStatus ===
      "rejected"
    ) {
      this.reviewedAt =
        currentDate;

      this.rejectedAt =
        currentDate;

      this.verifiedAt = null;
      this.payoutsEnabled = false;
    }

    if (
      this.verificationStatus ===
      "disabled"
    ) {
      this.payoutsEnabled = false;
    }

    if (
      this.verificationStatus ===
      "not_submitted"
    ) {
      this.payoutsEnabled = false;
    }
  }
);

/* =====================================
   Virtual masked account information
===================================== */

ownerPayoutAccountSchema.virtual(
  "maskedAccountNumber"
).get(function () {
  if (
    this.payoutMethod !==
      "bank_account" ||
    !this.bankDetails
      ?.accountNumberLast4
  ) {
    return "";
  }

  return `••••••••${this.bankDetails.accountNumberLast4}`;
});

/* =====================================
   Safe frontend response

   Razorpay internal identifiers are not
   included in the returned object.
===================================== */

ownerPayoutAccountSchema.methods
  .getSafeDetails = function () {
  const payoutAccount =
    this.toObject({
      virtuals: true,
    });

  if (
    payoutAccount.razorpay
  ) {
    delete payoutAccount
      .razorpay.linkedAccountId;

    delete payoutAccount
      .razorpay.contactId;

    delete payoutAccount
      .razorpay.fundAccountId;

    delete payoutAccount
      .razorpay.stakeholderId;

    delete payoutAccount
      .razorpay
      .productConfigurationId;

    delete payoutAccount
      .razorpay.providerReference;

    delete payoutAccount
      .razorpay.providerError;
  }

  delete payoutAccount.__v;

  return payoutAccount;
};

/* =====================================
   Database indexes
===================================== */

ownerPayoutAccountSchema.index({
  verificationStatus: 1,
  updatedAt: -1,
});

ownerPayoutAccountSchema.index({
  payoutsEnabled: 1,
  verifiedAt: -1,
});

ownerPayoutAccountSchema.index({
  "razorpay.providerStatus": 1,
  updatedAt: -1,
});

/* =====================================
   Model export
===================================== */

const OwnerPayoutAccount =
  mongoose.model(
    "OwnerPayoutAccount",
    ownerPayoutAccountSchema
  );

export default OwnerPayoutAccount;