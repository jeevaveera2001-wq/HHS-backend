import {
  rateLimit,
} from "express-rate-limit";

/* =====================================
   Rate-limit response helper
===================================== */

const createLimitHandler = (
  message
) => {
  return (
    req,
    res
  ) => {
    const resetTime =
      req.rateLimit?.resetTime;

    const retryAfterSeconds =
      resetTime instanceof Date
        ? Math.max(
            Math.ceil(
              (
                resetTime.getTime() -
                Date.now()
              ) / 1000
            ),
            1
          )
        : null;

    if (retryAfterSeconds) {
      res.setHeader(
        "Retry-After",
        String(
          retryAfterSeconds
        )
      );
    }

    return res
      .status(429)
      .json({
        success: false,
        message,

        retryAfter:
          retryAfterSeconds,
      });
  };
};

/* =====================================
   General API limiter

   500 requests per IP every 15 minutes.
===================================== */

export const generalApiLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 500,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    skip(req) {
      return (
        req.method ===
          "OPTIONS" ||
        req.path ===
          "/health"
      );
    },

    handler:
      createLimitHandler(
        "Too many requests were received from this device. Please wait and try again."
      ),
  });

/* =====================================
   Authentication limiter

   For register and general auth routes.
===================================== */

export const authenticationLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 30,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    skip(req) {
      return (
        req.method ===
        "OPTIONS"
      );
    },

    handler:
      createLimitHandler(
        "Too many authentication requests. Please wait before trying again."
      ),
  });

/* =====================================
   Login limiter

   Successful logins are not counted.
===================================== */

export const loginLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 8,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    skipSuccessfulRequests:
      true,

    handler:
      createLimitHandler(
        "Too many unsuccessful login attempts. Please wait 15 minutes and try again."
      ),
  });

/* =====================================
   Password reset limiter
===================================== */

export const passwordResetLimiter =
  rateLimit({
    windowMs:
      60 * 60 * 1000,

    limit: 5,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    handler:
      createLimitHandler(
        "Too many password reset requests. Please wait before requesting another reset."
      ),
  });

/* =====================================
   Payment limiter
===================================== */

export const paymentLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 30,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    handler:
      createLimitHandler(
        "Too many payment requests. Please wait before trying again."
      ),
  });

/* =====================================
   Support ticket limiter
===================================== */

export const supportLimiter =
  rateLimit({
    windowMs:
      60 * 60 * 1000,

    limit: 25,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    handler:
      createLimitHandler(
        "Too many support requests were submitted. Please wait before trying again."
      ),
  });

/* =====================================
   File or image upload limiter
===================================== */

export const uploadLimiter =
  rateLimit({
    windowMs:
      60 * 60 * 1000,

    limit: 40,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    handler:
      createLimitHandler(
        "Too many upload requests. Please wait before uploading again."
      ),
  });

/* =====================================
   Sensitive staff action limiter
===================================== */

export const sensitiveActionLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 40,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    handler:
      createLimitHandler(
        "Too many sensitive management requests. Please wait and try again."
      ),
  });