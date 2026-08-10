import mongoose from "mongoose";

/* =====================================
   Available user roles
===================================== */

export const USER_ROLES =
  Object.freeze({
    CUSTOMER:
      "customer",

    OWNER:
      "owner",

    SUPPORT:
      "support",

    ADMIN:
      "admin",

    PROPERTY_ADMIN:
      "property_admin",

    BOOKING_MANAGER:
      "booking_manager",

    FINANCE_MANAGER:
      "finance_manager",

    OPERATIONS_MANAGER:
      "operations_manager",

    SUPER_ADMIN:
      "super_admin",
  });

const allowedRoles =
  Object.values(
    USER_ROLES
  );

/* =====================================
   Remove private user fields
===================================== */

const removePrivateFields = (
  document,
  returnedObject
) => {
  delete returnedObject.password;

  delete returnedObject
    .tokenVersion;

  delete returnedObject
    .googleId;

  delete returnedObject.__v;

  return returnedObject;
};

/* =====================================
   User schema
===================================== */

const userSchema =
  new mongoose.Schema(
    {
      fullName: {
        type: String,

        required: [
          true,
          "Full name is required.",
        ],

        trim: true,

        minlength: [
          3,
          "Full name must contain at least 3 characters.",
        ],

        maxlength: [
          100,
          "Full name cannot exceed 100 characters.",
        ],
      },

      email: {
        type: String,

        required: [
          true,
          "Email address is required.",
        ],

        unique: true,

        lowercase: true,

        trim: true,

        maxlength: [
          150,
          "Email address is too long.",
        ],

        match: [
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

          "Please provide a valid email address.",
        ],
      },

      /*
       * Google does not provide a phone
       * number during authentication.
       *
       * Phone remains required for normal
       * email/password registration.
       */

      phone: {
        type: String,

        required:
          function requirePhoneForLocalAccount() {
            return (
              this.authProvider ===
              "local"
            );
          },

        unique: true,

        sparse: true,

        trim: true,

        match: [
          /^\+?[0-9]{10,15}$/,

          "Please provide a valid phone number.",
        ],

        default:
          undefined,
      },

      /*
       * Password remains mandatory for
       * normal accounts but is not stored
       * for Google-only accounts.
       */

      password: {
        type: String,

        required:
          function requirePasswordForLocalAccount() {
            return (
              this.authProvider ===
              "local"
            );
          },

        minlength: [
          8,
          "Password must contain at least 8 characters.",
        ],

        maxlength: [
          128,
          "Password is too long.",
        ],

        select: false,

        default:
          undefined,
      },

      /* =================================
         Authentication provider
      ================================= */

      authProvider: {
        type: String,

        enum: [
          "local",
          "google",
        ],

        default:
          "local",

        index: true,
      },

      googleId: {
        type: String,

        unique: true,

        sparse: true,

        trim: true,

        default:
          undefined,

        select: false,
      },

      tokenVersion: {
        type: Number,

        default: 0,

        min: 0,

        select: false,
      },

      role: {
        type: String,

        enum: {
          values:
            allowedRoles,

          message:
            "{VALUE} is not a supported user role.",
        },

        default:
          USER_ROLES
            .CUSTOMER,

        index: true,
      },

      customPermissions: [
        {
          type: String,

          trim: true,
        },
      ],

      revokedPermissions: [
        {
          type: String,

          trim: true,
        },
      ],

      createdBy: {
        type:
          mongoose.Schema
            .Types.ObjectId,

        ref: "User",

        default: null,
      },

      profileImage: {
        type: String,

        trim: true,

        default: "",
      },

      savedProperties: [
        {
          type:
            mongoose.Schema
              .Types.ObjectId,

          ref:
            "Property",
        },
      ],

      isActive: {
        type: Boolean,

        default: true,

        index: true,
      },

      /*
       * Google verifies ownership of the
       * email address before returning it.
       */

      isVerified: {
        type: Boolean,

        default: false,
      },

      lastLogin: {
        type: Date,

        default: null,
      },

      lastPasswordChangedAt: {
        type: Date,

        default: null,
      },
    },

    {
      timestamps: true,

      toJSON: {
        virtuals: true,

        transform:
          removePrivateFields,
      },

      toObject: {
        virtuals: true,

        transform:
          removePrivateFields,
      },
    }
  );

/* =====================================
   Normalize user information
===================================== */

userSchema.pre(
  "validate",

  function normalizeUserFields(
    next
  ) {
    if (
      typeof this.fullName ===
      "string"
    ) {
      this.fullName =
        this.fullName.trim();
    }

    if (
      typeof this.email ===
      "string"
    ) {
      this.email =
        this.email
          .trim()
          .toLowerCase();
    }

    if (
      typeof this.phone ===
      "string"
    ) {
      this.phone =
        this.phone
          .replace(
            /\s+/g,
            ""
          )
          .trim();

      if (!this.phone) {
        this.phone =
          undefined;
      }
    }

    if (
      typeof this.googleId ===
      "string"
    ) {
      this.googleId =
        this.googleId
          .trim();

      if (!this.googleId) {
        this.googleId =
          undefined;
      }
    }

    next();
  }
);

/* =====================================
   Database indexes
===================================== */

userSchema.index({
  role: 1,
  isActive: 1,
});

userSchema.index({
  createdAt: -1,
});

/* =====================================
   User display name
===================================== */

userSchema
  .virtual(
    "displayName"
  )
  .get(
    function getDisplayName() {
      return this.fullName;
    }
  );

/* =====================================
   User model
===================================== */

const User =
  mongoose.model(
    "User",
    userSchema
  );

export default User;