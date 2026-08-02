import {
  body,
  matchedData,
  param,
  validationResult,
} from "express-validator";

/* =====================================
   Validation result
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
          errors[0]?.message ||
          "Please correct the submitted information.",

        errors,
      });
  }

  req.body =
    matchedData(req, {
      locations: [
        "body",
      ],

      onlyValidData:
        true,
    });

  return next();
};

/* =====================================
   Forgot-password validation
===================================== */

export const validateForgotPassword =
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

/* =====================================
   Reset-password validation
===================================== */

export const validateResetPassword =
  [
    param("token")
      .trim()
      .matches(
        /^[a-f0-9]{64}$/i
      )
      .withMessage(
        "Password reset link is invalid."
      ),

    body("newPassword")
      .isString()
      .withMessage(
        "New password must be text."
      )
      .isLength({
        min: 8,
        max: 128,
      })
      .withMessage(
        "New password must contain between 8 and 128 characters."
      )
      .matches(/[A-Za-z]/)
      .withMessage(
        "New password must contain at least one letter."
      )
      .matches(/[0-9]/)
      .withMessage(
        "New password must contain at least one number."
      ),

    body("confirmPassword")
      .isString()
      .withMessage(
        "Password confirmation must be text."
      )
      .notEmpty()
      .withMessage(
        "Please confirm your new password."
      )
      .custom(
        (
          value,
          {
            req,
          }
        ) => {
          if (
            value !==
            req.body
              .newPassword
          ) {
            throw new Error(
              "New passwords do not match."
            );
          }

          return true;
        }
      ),

    handleValidationResult,
  ];