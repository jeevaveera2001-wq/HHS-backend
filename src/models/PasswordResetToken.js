import mongoose from "mongoose";

const passwordResetTokenSchema =
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

      tokenHash: {
        type: String,

        required: true,

        unique: true,

        select: false,
      },

      expiresAt: {
        type: Date,

        required: true,

        index: true,
      },
    },

    {
      timestamps: true,

      toJSON: {
        transform(
          document,
          returnedObject
        ) {
          delete returnedObject
            .tokenHash;

          delete returnedObject
            .__v;

          return returnedObject;
        },
      },
    }
  );

/*
 * MongoDB automatically removes expired
 * records. Expiry is also checked directly
 * by the controller because TTL cleanup may
 * run slightly after the expiration time.
 */

passwordResetTokenSchema.index(
  {
    expiresAt: 1,
  },

  {
    expireAfterSeconds: 0,
  }
);

const PasswordResetToken =
  mongoose.model(
    "PasswordResetToken",
    passwordResetTokenSchema
  );

export default PasswordResetToken;