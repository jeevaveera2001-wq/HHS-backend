import {
  body,
  param,
  validationResult,
} from "express-validator";

/* =====================================
   Validation result handler
===================================== */

const handleValidationResult = (
  req,
  res,
  next
) => {
  const result =
    validationResult(req);

  if (!result.isEmpty()) {
    const errors =
      result.array().map(
        (error) => {
          return {
            field:
              error.path ||
              "request",

            message:
              error.msg,
          };
        }
      );

    return res
      .status(400)
      .json({
        success: false,

        message:
          errors[0]
            ?.message ||
          "Please correct the submitted information.",

        errors,
      });
  }

  return next();
};

/* =====================================
   Verify email token
===================================== */

export const validateEmailVerification =
  [
    param("token")
      .trim()
      .notEmpty()
      .withMessage(
        "Email verification token is required."
      )
      .isLength({
        min: 64,
        max: 64,
      })
      .withMessage(
        "Email verification token is invalid."
      )
      .isHexadecimal()
      .withMessage(
        "Email verification token is invalid."
      ),

    handleValidationResult,
  ];

/* =====================================
   Resend verification email
===================================== */

export const validateVerificationResend =
  [
    body("email")
      .customSanitizer(
        (value) => {
          return String(
            value || ""
          )
            .trim()
            .toLowerCase();
        }
      )
      .notEmpty()
      .withMessage(
        "Email address is required."
      )
      .isEmail()
      .withMessage(
        "Please provide a valid email address."
      )
      .isLength({
        max: 150,
      })
      .withMessage(
        "Email address is too long."
      ),

    handleValidationResult,
  ];