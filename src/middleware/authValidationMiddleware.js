import {
  body,
  matchedData,
  validationResult,
} from "express-validator";

/* =====================================
   Shared sanitizers
===================================== */

const sanitizeEmail = (
  value
) => {
  return String(value || "")
    .trim()
    .toLowerCase();
};

const sanitizePhone = (
  value
) => {
  return String(value || "")
    .trim()
    .replace(
      /[\s()-]/g,
      ""
    );
};

/* =====================================
   Validation result handler

   Only validated fields are passed
   to the controller. Unexpected fields,
   including role, are removed.
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

  req.body =
    matchedData(req, {
      locations: [
        "body",
      ],

      includeOptionals:
        false,

      onlyValidData:
        true,
    });

  return next();
};

/* =====================================
   Registration validation
===================================== */

export const validateRegistration =
  [
    body("fullName")
      .customSanitizer(
        (value) => {
          return String(
            value || ""
          )
            .trim()
            .replace(
              /\s+/g,
              " "
            );
        }
      )
      .notEmpty()
      .withMessage(
        "Full name is required."
      )
      .isLength({
        min: 3,
        max: 100,
      })
      .withMessage(
        "Full name must contain between 3 and 100 characters."
      ),

    body("email")
      .customSanitizer(
        sanitizeEmail
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

    body("phone")
      .customSanitizer(
        sanitizePhone
      )
      .notEmpty()
      .withMessage(
        "Phone number is required."
      )
      .matches(
        /^\+?[0-9]{10,15}$/
      )
      .withMessage(
        "Phone number must contain between 10 and 15 digits."
      ),

    body("password")
      .isString()
      .withMessage(
        "Password must be text."
      )
      .isLength({
        min: 8,
        max: 128,
      })
      .withMessage(
        "Password must contain between 8 and 128 characters."
      )
      .matches(/[A-Za-z]/)
      .withMessage(
        "Password must contain at least one letter."
      )
      .matches(/[0-9]/)
      .withMessage(
        "Password must contain at least one number."
      ),

    handleValidationResult,
  ];

/* =====================================
   Login validation
===================================== */

export const validateLogin = [
  body("email")
    .customSanitizer(
      sanitizeEmail
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

  /*
   * Login does not enforce the new
   * eight-character rule because older
   * accounts may still use a six-character
   * password.
   */

  body("password")
    .isString()
    .withMessage(
      "Password must be text."
    )
    .notEmpty()
    .withMessage(
      "Password is required."
    )
    .isLength({
      max: 128,
    })
    .withMessage(
      "Password is too long."
    ),

  handleValidationResult,
];

/* =====================================
   Profile update validation
===================================== */

export const validateProfileUpdate =
  [
    body("fullName")
      .customSanitizer(
        (value) => {
          return String(
            value || ""
          )
            .trim()
            .replace(
              /\s+/g,
              " "
            );
        }
      )
      .notEmpty()
      .withMessage(
        "Full name is required."
      )
      .isLength({
        min: 3,
        max: 100,
      })
      .withMessage(
        "Full name must contain between 3 and 100 characters."
      ),

    body("phone")
      .customSanitizer(
        sanitizePhone
      )
      .notEmpty()
      .withMessage(
        "Phone number is required."
      )
      .matches(
        /^\+?[0-9]{10,15}$/
      )
      .withMessage(
        "Phone number must contain between 10 and 15 digits."
      ),

    handleValidationResult,
  ];

/* =====================================
   Password change validation
===================================== */

export const validatePasswordChange =
  [
    body("currentPassword")
      .isString()
      .withMessage(
        "Current password must be text."
      )
      .notEmpty()
      .withMessage(
        "Current password is required."
      )
      .isLength({
        max: 128,
      })
      .withMessage(
        "Current password is too long."
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
  