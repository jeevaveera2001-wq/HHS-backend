import mongoose from "mongoose";

/* =====================================
   Remove private user fields
===================================== */

const removePrivateFields = (
  document,
  returnedObject
) => {
  delete returnedObject.password;

  delete returnedObject.tokenVersion;

  delete returnedObject.__v;

  return returnedObject;
};

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

      phone: {
        type: String,

        required: [
          true,
          "Phone number is required.",
        ],

        unique: true,

        trim: true,

        match: [
          /^\+?[0-9]{10,15}$/,

          "Please provide a valid phone number.",
        ],
      },

      password: {
        type: String,

        required: [
          true,
          "Password is required.",
        ],

        minlength: [
          8,
          "Password must contain at least 8 characters.",
        ],

        maxlength: [
          128,
          "Password is too long.",
        ],

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

        enum: [
          "customer",
          "owner",
          "support",
          "property_admin",
          "booking_manager",
          "finance_manager",
          "operations_manager",
          "super_admin",
        ],

        default:
          "customer",

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
          mongoose.Schema.Types
            .ObjectId,

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
            mongoose.Schema.Types
              .ObjectId,

          ref: "Property",
        },
      ],

      isActive: {
        type: Boolean,

        default: true,

        index: true,
      },

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
  .virtual("displayName")
  .get(function () {
    return this.fullName;
  });

const User =
  mongoose.model(
    "User",
    userSchema
  );

export default User;