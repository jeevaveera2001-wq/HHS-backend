import express from "express";

import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword,
  logout,
} from "../controllers/authController.js";

import protect from "../middleware/authMiddleware.js";

import {
  validateLogin,
  validatePasswordChange,
  validateProfileUpdate,
  validateRegistration,
} from "../middleware/authValidationMiddleware.js";

import {
  validateForgotPassword,
  validateResetPassword,
} from "../middleware/passwordResetValidationMiddleware.js";

import {
  validateEmailVerification,
  validateVerificationResend,
} from "../middleware/emailVerificationValidationMiddleware.js";

import {
  passwordResetLimiter,
} from "../middleware/rateLimitMiddleware.js";

const router =
  express.Router();

/* =====================================
   Public authentication routes
===================================== */

router.post(
  "/register",
  validateRegistration,
  register
);

router.post(
  "/login",
  validateLogin,
  login
);

/* =====================================
   Email verification routes
===================================== */

router.put(
  "/verify-email/:token",
  passwordResetLimiter,
  validateEmailVerification,
  verifyEmail
);

router.post(
  "/resend-verification",
  passwordResetLimiter,
  validateVerificationResend,
  resendVerificationEmail
);

/* =====================================
   Password recovery routes
===================================== */

router.post(
  "/forgot-password",
  passwordResetLimiter,
  validateForgotPassword,
  forgotPassword
);

router.put(
  "/reset-password/:token",
  passwordResetLimiter,
  validateResetPassword,
  resetPassword
);

/* =====================================
   Protected profile routes
===================================== */

router.get(
  "/profile",
  protect,
  getProfile
);

router.put(
  "/profile",
  protect,
  validateProfileUpdate,
  updateProfile
);

router.put(
  "/change-password",
  protect,
  validatePasswordChange,
  changePassword
);

router.post(
  "/logout",
  protect,
  logout
);

export default router;