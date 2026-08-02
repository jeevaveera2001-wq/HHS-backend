import mongoose from "mongoose";

const emailVerificationTokenSchema =
  new mongoose.Schema(
    {
      user: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        required: true,

        unique: true,

        index: true,
      },

      /*
       * Only the SHA-256 hash is stored.
       * The original token exists only
       * inside the verification email.
       */

      tokenHash: {
        type: String,

        required: true,

        unique: true,

        index: true,

        select: false,
      },

      expiresAt: {
        type: Date,

        required: true,

        index: true,
      },

      createdAt: {
        type: Date,

        default: Date.now,
      },
    },
    {
      versionKey: false,
    }
  );

/* =====================================
   Automatically remove expired tokens
===================================== */

emailVerificationTokenSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  }
);

const EmailVerificationToken =
  mongoose.model(
    "EmailVerificationToken",
    emailVerificationTokenSchema
  );

export default EmailVerificationToken;