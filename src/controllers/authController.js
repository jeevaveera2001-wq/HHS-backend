import crypto from "node:crypto";

import bcrypt from "bcryptjs";

import jwt from "jsonwebtoken";

import {
  OAuth2Client,
} from "google-auth-library";

import User from "../models/User.js";

import PasswordResetToken from "../models/PasswordResetToken.js";

import EmailVerificationToken from "../models/EmailVerificationToken.js";

import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "../services/passwordResetEmailService.js";

import {
  sendEmailVerificationEmail,
  sendEmailVerifiedEmail,
} from "../services/emailVerificationEmailService.js";

/* =====================================
   Configuration helpers
===================================== */

const getResetDurationMinutes =
  () => {
    const configuredDuration =
      Number.parseInt(
        process.env
          .PASSWORD_RESET_MINUTES ||
          "15",
        10
      );

    if (
      !Number.isInteger(
        configuredDuration
      ) ||
      configuredDuration < 5 ||
      configuredDuration > 60
    ) {
      return 15;
    }

    return configuredDuration;
  };

const getVerificationDurationHours =
  () => {
    const configuredDuration =
      Number.parseInt(
        process.env
          .EMAIL_VERIFICATION_HOURS ||
          "24",
        10
      );

    if (
      !Number.isInteger(
        configuredDuration
      ) ||
      configuredDuration < 1 ||
      configuredDuration > 168
    ) {
      return 24;
    }

    return configuredDuration;
  };

/* =====================================
   Security-token helpers
===================================== */

const createSecurityToken =
  () => {
    const token =
      crypto
        .randomBytes(32)
        .toString("hex");

    const tokenHash =
      crypto
        .createHash(
          "sha256"
        )
        .update(token)
        .digest("hex");

    return {
      token,
      tokenHash,
    };
  };

const hashSecurityToken = (
  token
) => {
  return crypto
    .createHash(
      "sha256"
    )
    .update(token)
    .digest("hex");
};

/* =====================================
   Issue email-verification token
===================================== */

const issueEmailVerificationToken =
  async (user) => {
    const {
      token,
      tokenHash,
    } =
      createSecurityToken();

    const expiresInHours =
      getVerificationDurationHours();

    const expiresAt =
      new Date(
        Date.now() +
          expiresInHours *
            60 *
            60 *
            1000
      );

    await EmailVerificationToken
      .findOneAndUpdate(
        {
          user:
            user._id,
        },

        {
          $set: {
            tokenHash,

            expiresAt,

            createdAt:
              new Date(),
          },
        },

        {
          upsert: true,

          new: true,

          runValidators:
            true,

          setDefaultsOnInsert:
            true,
        }
      );

    return {
      verificationToken:
        token,

      expiresInHours,
    };
  };

/* =====================================
   Generate application JWT
===================================== */

const generateToken = (
  user
) => {
  return jwt.sign(
    {
      id:
        user._id
          .toString(),

      tokenVersion:
        Number(
          user.tokenVersion ??
            0
        ),
    },

    process.env
      .JWT_SECRET,

    {
      algorithm:
        "HS256",

      expiresIn:
        process.env
          .JWT_EXPIRES_IN ||
        "7d",
    }
  );
};

/* =====================================
   Google OAuth client
===================================== */

const getGoogleOAuthClient =
  () => {
    const clientId =
      process.env
        .GOOGLE_CLIENT_ID;

    if (!clientId) {
      throw new Error(
        "GOOGLE_CLIENT_ID is not configured."
      );
    }

    return new OAuth2Client(
      clientId
    );
  };

/* =====================================
   Safe user response
===================================== */

const createUserResponse = (
  user
) => {
  return {
    id:
      user._id,

    fullName:
      user.fullName,

    email:
      user.email,

    phone:
      user.phone ||
      "",

    role:
      user.role,

    profileImage:
      user.profileImage,

    isVerified:
      Boolean(
        user.isVerified
      ),

    authProvider:
      user.authProvider ||
      "local",
  };
};

/* =====================================
   Email notification helpers
===================================== */

const notifyPasswordChanged = (
  user
) => {
  sendPasswordChangedEmail({
    user,
  }).catch(
    (error) => {
      console.error(
        "Password notification email error:",
        error.message
      );
    }
  );
};

const notifyEmailVerified =
  async (user) => {
    try {
      await sendEmailVerifiedEmail({
        email:
          user.email,

        fullName:
          user.fullName,
      });
    } catch (error) {
      console.error(
        "Verification confirmation email error:",
        error.message
      );
    }
  };

/* =====================================
   Register user

   POST /api/auth/register
===================================== */

export const register =
  async (
    req,
    res
  ) => {
    try {
      const {
        fullName,
        email,
        phone,
        password,
      } = req.body;

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const normalizedPhone =
        phone
          .replace(
            /\s+/g,
            ""
          )
          .trim();

      const existingUser =
        await User.findOne({
          $or: [
            {
              email:
                normalizedEmail,
            },

            {
              phone:
                normalizedPhone,
            },
          ],
        });

      if (existingUser) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              existingUser
                .email ===
              normalizedEmail
                ? "Email address is already registered."
                : "Phone number is already registered.",
          });
      }

      const hashedPassword =
        await bcrypt.hash(
          password,
          12
        );

      const user =
        await User.create({
          fullName:
            fullName.trim(),

          email:
            normalizedEmail,

          phone:
            normalizedPhone,

          password:
            hashedPassword,

          authProvider:
            "local",

          isVerified:
            false,
        });

      let verificationEmailSent =
        false;

      try {
        const {
          verificationToken,
          expiresInHours,
        } =
          await issueEmailVerificationToken(
            user
          );

        const emailResult =
          await sendEmailVerificationEmail({
            email:
              user.email,

            fullName:
              user.fullName,

            token:
              verificationToken,

            expiresInHours,
          });

        verificationEmailSent =
          Boolean(
            emailResult.success
          );

        if (
          !verificationEmailSent
        ) {
          await EmailVerificationToken
            .deleteOne({
              user:
                user._id,
            });
        }
      } catch (
        verificationError
      ) {
        console.error(
          "Registration verification email error:",
          verificationError
        );

        await EmailVerificationToken
          .deleteOne({
            user:
              user._id,
          })
          .catch(
            () => {}
          );
      }

      return res
        .status(201)
        .json({
          success:
            true,

          message:
            verificationEmailSent
              ? "Registration successful. Please check your email and verify your account before logging in."
              : "Registration successful, but the verification email could not be sent. Please request another verification email.",

          requiresEmailVerification:
            true,

          verificationEmailSent,

          user:
            createUserResponse(
              user
            ),
        });
    } catch (error) {
      console.error(
        "Register error:",
        error
      );

      if (
        error.code ===
        11000
      ) {
        const duplicateField =
          Object.keys(
            error.keyPattern ||
              error.keyValue ||
              {}
          )[0];

        return res
          .status(409)
          .json({
            success:
              false,

            message:
              duplicateField ===
              "phone"
                ? "Phone number is already registered."
                : "Email address is already registered.",
          });
      }

      if (
        error.name ===
        "ValidationError"
      ) {
        const message =
          Object.values(
            error.errors
          )
            .map(
              (item) =>
                item.message
            )
            .join(", ");

        return res
          .status(400)
          .json({
            success:
              false,

            message,
          });
      }

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Unable to register user.",
        });
    }
  };

/* =====================================
   Login with email and password

   POST /api/auth/login
===================================== */

export const login =
  async (
    req,
    res
  ) => {
    try {
      const {
        email,
        password,
      } = req.body;

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email:
            normalizedEmail,
        }).select(
          "+password +tokenVersion"
        );

      if (!user) {
        return res
          .status(401)
          .json({
            success:
              false,

            message:
              "Invalid email or password.",
          });
      }

      if (
        !user.isActive
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "Your account has been disabled.",
          });
      }

      /*
       * Google-only accounts do not
       * contain a local password.
       */

      if (!user.password) {
        return res
          .status(401)
          .json({
            success:
              false,

            code:
              "GOOGLE_LOGIN_REQUIRED",

            message:
              "This account uses Google login. Select Continue with Google.",
          });
      }

      const passwordMatches =
        await bcrypt.compare(
          password,
          user.password
        );

      if (
        !passwordMatches
      ) {
        return res
          .status(401)
          .json({
            success:
              false,

            message:
              "Invalid email or password.",
          });
      }

      /*
       * Verification is checked only
       * after proving the password.
       */

      if (
        user.role ===
          "customer" &&
        !user.isVerified
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            code:
              "EMAIL_NOT_VERIFIED",

            requiresEmailVerification:
              true,

            email:
              user.email,

            message:
              "Please verify your email address before logging in.",
          });
      }

      user.lastLogin =
        new Date();

      await user.save({
        validateBeforeSave:
          false,
      });

      const token =
        generateToken(
          user
        );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Login successful.",

          token,

          user:
            createUserResponse(
              user
            ),
        });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Unable to login.",
        });
    }
  };

/* =====================================
   Continue with Google

   POST /api/auth/google
===================================== */

export const googleLogin =
  async (
    req,
    res
  ) => {
    try {
      const credential =
        String(
          req.body
            ?.credential ||
            ""
        ).trim();

      if (!credential) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Google login credential is required.",
          });
      }

      const clientId =
        process.env
          .GOOGLE_CLIENT_ID;

      const googleClient =
        getGoogleOAuthClient();

      /*
       * This verifies Google's signature,
       * token expiry, issuer and audience.
       */

      const ticket =
        await googleClient
          .verifyIdToken({
            idToken:
              credential,

            audience:
              clientId,
          });

      const payload =
        ticket.getPayload();

      if (
        !payload?.sub ||
        !payload?.email ||
        payload
          .email_verified !==
          true
      ) {
        return res
          .status(401)
          .json({
            success:
              false,

            message:
              "Google could not verify this email address.",
          });
      }

      const email =
        payload.email
          .trim()
          .toLowerCase();

      /*
       * Query by Google ID or verified
       * email to support existing users.
       */

      let user =
        await User.findOne({
          $or: [
            {
              googleId:
                payload.sub,
            },

            {
              email,
            },
          ],
        }).select(
          "+tokenVersion +googleId"
        );

      if (
        user &&
        !user.isActive
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "Your account has been disabled.",
          });
      }

      /*
       * Create a customer automatically
       * when the Google email is new.
       */

      if (!user) {
        user =
          await User.create({
            fullName:
              payload.name ||
              email.split(
                "@"
              )[0],

            email,

            googleId:
              payload.sub,

            authProvider:
              "google",

            profileImage:
              payload.picture ||
              "",

            isVerified:
              true,

            lastLogin:
              new Date(),
          });
      } else {
        /*
         * Protect against linking one
         * record to two Google accounts.
         */

        if (
          user.googleId &&
          user.googleId !==
            payload.sub
        ) {
          return res
            .status(409)
            .json({
              success:
                false,

              message:
                "This email is already linked to another Google account.",
            });
        }

        user.googleId =
          payload.sub;

        user.isVerified =
          true;

        user.lastLogin =
          new Date();

        if (
          !user.profileImage &&
          payload.picture
        ) {
          user.profileImage =
            payload.picture;
        }

        await user.save({
          validateBeforeSave:
            false,
        });
      }

      const token =
        generateToken(
          user
        );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Google login successful.",

          token,

          user:
            createUserResponse(
              user
            ),
        });
    } catch (error) {
      console.error(
        "Google login error:",
        error
      );

      const configurationError =
        error?.message
          ?.includes(
            "GOOGLE_CLIENT_ID"
          );

      return res
        .status(
          configurationError
            ? 500
            : 401
        )
        .json({
          success:
            false,

          message:
            configurationError
              ? "Google login is not configured on the server."
              : "Google login failed. Please try again.",
        });
    }
  };

/* =====================================
   Verify email address

   PUT /api/auth/verify-email/:token
===================================== */

/* =====================================
   Verify email address

   PUT /api/auth/verify-email/:token
===================================== */

export const verifyEmail =
  async (
    req,
    res
  ) => {
    try {
      const {
        token,
      } = req.params;

      const tokenHash =
        hashSecurityToken(
          token
        );

      const verificationRecord =
        await EmailVerificationToken
          .findOne({
            tokenHash,
          });

      if (
        !verificationRecord
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Email verification link is invalid or has expired.",
          });
      }

      if (
        verificationRecord
          .expiresAt <=
        new Date()
      ) {
        await EmailVerificationToken
          .deleteOne({
            _id:
              verificationRecord
                ._id,
          });

        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Email verification link has expired. Please request a new link.",
          });
      }

      const user =
        await User.findById(
          verificationRecord
            .user
        );

      if (
        !user ||
        !user.isActive
      ) {
        await EmailVerificationToken
          .deleteOne({
            _id:
              verificationRecord
                ._id,
          });

        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The account associated with this verification link is unavailable.",
          });
      }

      if (
        user.isVerified
      ) {
        await EmailVerificationToken
          .deleteMany({
            user:
              user._id,
          });

        return res
          .status(200)
          .json({
            success:
              true,

            message:
              "Your email address is already verified. You can log in.",

            user:
              createUserResponse(
                user
              ),
          });
      }

      user.isVerified =
        true;

      await user.save({
        validateBeforeSave:
          false,
      });

      await EmailVerificationToken
        .deleteMany({
          user:
            user._id,
        });

      await notifyEmailVerified(
        user
      );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Email verified successfully. You can now log in to your HHS account.",

          user:
            createUserResponse(
              user
            ),
        });
    } catch (error) {
      console.error(
        "Verify email error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Unable to verify email address.",
        });
    }
  };

/* =====================================
   Resend verification email

   POST /api/auth/resend-verification
===================================== */

export const resendVerificationEmail =
  async (
    req,
    res
  ) => {
    const responseMessage =
      "If an unverified active account exists for that email address, a new verification link has been sent.";

    try {
      const {
        email,
      } = req.body;

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email:
            normalizedEmail,

          isActive:
            true,
        });

      /*
       * Google accounts are already
       * verified by Google.
       */

      if (
        !user ||
        user.isVerified ||
        user.authProvider ===
          "google"
      ) {
        return res
          .status(200)
          .json({
            success:
              true,

            message:
              responseMessage,
          });
      }

      const {
        verificationToken,
        expiresInHours,
      } =
        await issueEmailVerificationToken(
          user
        );

      const emailResult =
        await sendEmailVerificationEmail({
          email:
            user.email,

          fullName:
            user.fullName,

          token:
            verificationToken,

          expiresInHours,
        });

      if (
        !emailResult.success
      ) {
        await EmailVerificationToken
          .deleteOne({
            user:
              user._id,
          });
      }

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            responseMessage,
        });
    } catch (error) {
      console.error(
        "Resend verification email error:",
        error
      );

      /*
       * A generic response prevents
       * account enumeration.
       */

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            responseMessage,
        });
    }
  };

/* =====================================
   Forgot password

   POST /api/auth/forgot-password
===================================== */

export const forgotPassword =
  async (
    req,
    res
  ) => {
    const responseMessage =
      "If an active account exists for that email address, a password reset link has been sent.";

    try {
      const {
        email,
      } = req.body;

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email:
            normalizedEmail,

          isActive:
            true,
        });

      /*
       * Google-only accounts do not
       * have a local password to reset.
       *
       * Return the same generic response
       * to prevent account enumeration.
       */

      if (
        !user ||
        user.authProvider ===
          "google"
      ) {
        return res
          .status(200)
          .json({
            success:
              true,

            message:
              responseMessage,
          });
      }

      const {
        token:
          resetToken,

        tokenHash,
      } =
        createSecurityToken();

      const expiresInMinutes =
        getResetDurationMinutes();

      const expiresAt =
        new Date(
          Date.now() +
            expiresInMinutes *
              60 *
              1000
        );

      await PasswordResetToken
        .findOneAndUpdate(
          {
            user:
              user._id,
          },

          {
            $set: {
              tokenHash,
              expiresAt,
            },
          },

          {
            upsert: true,

            new: true,

            runValidators:
              true,

            setDefaultsOnInsert:
              true,
          }
        );

      const emailResult =
        await sendPasswordResetEmail({
          user,

          resetToken,

          expiresInMinutes,
        });

      if (
        !emailResult.success
      ) {
        await PasswordResetToken
          .deleteOne({
            user:
              user._id,
          });
      }

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            responseMessage,
        });
    } catch (error) {
      console.error(
        "Forgot password error:",
        error
      );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            responseMessage,
        });
    }
  };

/* =====================================
   Reset password

   PUT /api/auth/reset-password/:token
===================================== */

export const resetPassword =
  async (
    req,
    res
  ) => {
    try {
      const {
        token,
      } = req.params;

      const {
        newPassword,
      } = req.body;

      const tokenHash =
        hashSecurityToken(
          token
        );

      const resetRecord =
        await PasswordResetToken
          .findOne({
            tokenHash,

            expiresAt: {
              $gt:
                new Date(),
            },
          });

      if (!resetRecord) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Password reset link is invalid or has expired.",
          });
      }

      const user =
        await User.findById(
          resetRecord.user
        ).select(
          "+password +tokenVersion"
        );

      if (
        !user ||
        !user.isActive ||
        !user.password
      ) {
        await PasswordResetToken
          .deleteOne({
            _id:
              resetRecord._id,
          });

        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Password reset link is invalid or has expired.",
          });
      }

      const samePassword =
        await bcrypt.compare(
          newPassword,
          user.password
        );

      if (
        samePassword
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "New password must be different from the current password.",
          });
      }

      user.password =
        await bcrypt.hash(
          newPassword,
          12
        );

      user.lastPasswordChangedAt =
        new Date();

      user.tokenVersion =
        Number(
          user.tokenVersion ??
            0
        ) + 1;

      await user.save();

      await PasswordResetToken
        .deleteMany({
          user:
            user._id,
        });

      notifyPasswordChanged(
        user
      );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Password reset successfully. You can now login with your new password.",
        });
    } catch (error) {
      console.error(
        "Reset password error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Unable to reset password.",
        });
    }
  };

/* =====================================
   Get authenticated profile

   GET /api/auth/profile
===================================== */

export const getProfile =
  async (
    req,
    res
  ) => {
    return res
      .status(200)
      .json({
        success:
          true,

        user: {
          ...createUserResponse(
            req.user
          ),

          lastLogin:
            req.user
              .lastLogin,

          createdAt:
            req.user
              .createdAt,

          updatedAt:
            req.user
              .updatedAt,
        },
      });
  };

/* =====================================
   Update profile

   PUT /api/auth/profile
===================================== */

export const updateProfile =
  async (
    req,
    res
  ) => {
    try {
      const {
        fullName,
        phone,
      } = req.body;

      const normalizedPhone =
        phone
          ?.replace(
            /\s+/g,
            ""
          )
          .trim();

      const updateData = {};

      if (
        typeof fullName ===
        "string"
      ) {
        updateData.fullName =
          fullName.trim();
      }

      if (
        typeof normalizedPhone ===
        "string" &&
        normalizedPhone
      ) {
        const phoneOwner =
          await User.findOne({
            phone:
              normalizedPhone,

            _id: {
              $ne:
                req.user._id,
            },
          });

        if (phoneOwner) {
          return res
            .status(409)
            .json({
              success:
                false,

              message:
                "Phone number is already used by another account.",
            });
        }

        updateData.phone =
          normalizedPhone;
      }

      const updatedUser =
        await User
          .findByIdAndUpdate(
            req.user._id,

            {
              $set:
                updateData,
            },

            {
              new: true,

              runValidators:
                true,
            }
          );

      if (!updatedUser) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "User account not found.",
          });
      }

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Profile updated successfully.",

          user:
            createUserResponse(
              updatedUser
            ),
        });
    } catch (error) {
      console.error(
        "Update profile error:",
        error
      );

      if (
        error.code ===
        11000
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Phone number is already used by another account.",
          });
      }

      if (
        error.name ===
        "ValidationError"
      ) {
        const message =
          Object.values(
            error.errors
          )
            .map(
              (item) =>
                item.message
            )
            .join(", ");

        return res
          .status(400)
          .json({
            success:
              false,

            message,
          });
      }

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Unable to update profile.",
        });
    }
  };

/* =====================================
   Change password

   PUT /api/auth/change-password
===================================== */

export const changePassword =
  async (
    req,
    res
  ) => {
    try {
      const {
        currentPassword,
        newPassword,
      } = req.body;

      const user =
        await User.findById(
          req.user._id
        ).select(
          "+password +tokenVersion"
        );

      if (!user) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "User account not found.",
          });
      }

      /*
       * Google-only accounts have no
       * current local password.
       */

      if (!user.password) {
        return res
          .status(400)
          .json({
            success:
              false,

            code:
              "GOOGLE_ACCOUNT",

            message:
              "This account uses Google login and does not have a local password.",
          });
      }

      const passwordMatches =
        await bcrypt.compare(
          currentPassword,
          user.password
        );

      if (
        !passwordMatches
      ) {
        return res
          .status(401)
          .json({
            success:
              false,

            message:
              "Current password is incorrect.",
          });
      }

      const samePassword =
        await bcrypt.compare(
          newPassword,
          user.password
        );

      if (
        samePassword
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "New password must be different from the current password.",
          });
      }

      user.password =
        await bcrypt.hash(
          newPassword,
          12
        );

      user.lastPasswordChangedAt =
        new Date();

      user.tokenVersion =
        Number(
          user.tokenVersion ??
            0
        ) + 1;

      await user.save();

      await PasswordResetToken
        .deleteMany({
          user:
            user._id,
        });

      const replacementToken =
        generateToken(
          user
        );

      notifyPasswordChanged(
        user
      );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Password changed successfully.",

          token:
            replacementToken,

          user:
            createUserResponse(
              user
            ),
        });
    } catch (error) {
      console.error(
        "Change password error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Unable to change password.",
        });
    }
  };

/* =====================================
   Logout

   POST /api/auth/logout
===================================== */

export const logout =
  async (
    req,
    res
  ) => {
    try {
      const updatedUser =
        await User
          .findByIdAndUpdate(
            req.user._id,

            {
              $inc: {
                tokenVersion:
                  1,
              },
            },

            {
              new: true,
            }
          );

      if (
        !updatedUser
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "User account not found.",
          });
      }

      res.clearCookie(
        "token",
        {
          httpOnly: true,

          secure:
            process.env
              .NODE_ENV ===
            "production",

          sameSite:
            process.env
              .NODE_ENV ===
            "production"
              ? "none"
              : "lax",
        }
      );

      return res
        .status(200)
        .json({
          success:
            true,

          message:
            "Logged out successfully from all active sessions.",
        });
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            "Unable to logout.",
        });
    }
  };
