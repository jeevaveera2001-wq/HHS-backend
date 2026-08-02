import express from "express";

import cors from "cors";

import helmet from "helmet";

import morgan from "morgan";

import cookieParser from "cookie-parser";

import mongoose from "mongoose";

/* =====================================
   Application routes
===================================== */

import authRoutes from "./routes/authRoutes.js";

import propertyRoutes from "./routes/propertyRoutes.js";

import staffRoutes from "./routes/staffRoutes.js";

import adminRoutes from "./routes/adminRoutes.js";

import userManagementRoutes from "./routes/userManagementRoutes.js";

import bookingRoutes from "./routes/bookingRoutes.js";

import paymentRoutes from "./routes/paymentRoutes.js";

import payoutAccountRoutes from "./routes/payoutAccountRoutes.js";

import reviewRoutes from "./routes/reviewRoutes.js";

import savedPropertyRoutes from "./routes/savedPropertyRoutes.js";

import supportTicketRoutes from "./routes/supportTicketRoutes.js";

/* =====================================
   Payment webhook
===================================== */

import {
  handleRazorpayWebhook,
} from "./controllers/paymentController.js";

/* =====================================
   Rate-limit middleware
===================================== */

import {
  authenticationLimiter,
  generalApiLimiter,
  loginLimiter,
  paymentLimiter,
} from "./middleware/rateLimitMiddleware.js";

const app = express();

/* =====================================
   Proxy configuration

   Production hosting normally places
   Express behind one trusted proxy.
===================================== */

if (
  process.env.NODE_ENV ===
  "production"
) {
  app.set(
    "trust proxy",
    1
  );
}

/* =====================================
   Security middleware
===================================== */

app.disable(
  "x-powered-by"
);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy:
        "cross-origin",
    },
  })
);

/* =====================================
   CORS configuration
===================================== */

const normalizeOrigin = (
  origin
) => {
  return origin
    .trim()
    .replace(
      /\/+$/,
      ""
    );
};

const configuredOrigins = (
  process.env.FRONTEND_URL ||
  "http://localhost:5173"
)
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const developmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const allowedOrigins = [
  ...new Set([
    ...configuredOrigins,

    ...(process.env.NODE_ENV ===
    "production"
      ? []
      : developmentOrigins),
  ]),
];

const corsOptions = {
  origin(
    origin,
    callback
  ) {
    /*
     * Allow requests without Origin,
     * including Postman, mobile apps
     * and server-to-server requests.
     */

    if (!origin) {
      return callback(
        null,
        true
      );
    }

    const normalizedRequestOrigin =
      normalizeOrigin(origin);

    if (
      allowedOrigins.includes(
        normalizedRequestOrigin
      )
    ) {
      return callback(
        null,
        true
      );
    }

    const error =
      new Error(
        "This website origin is not permitted to access the HHS API."
      );

    error.status = 403;

    return callback(error);
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],

  exposedHeaders: [
    "RateLimit",
    "RateLimit-Policy",
    "Retry-After",
  ],

  optionsSuccessStatus: 204,

  maxAge: 86400,
};

app.use(
  cors(corsOptions)
);

/* =====================================
   Request logging
===================================== */

app.use(
  morgan(
    process.env.NODE_ENV ===
      "production"
      ? "combined"
      : "dev"
  )
);

/* =====================================
   Razorpay webhook

   This route must remain before:
   - express.json()
   - cookie parsing
   - general rate limiting

   Razorpay signature validation requires
   the original raw request body.
===================================== */

app.post(
  "/api/payments/webhook",

  express.raw({
    type:
      "application/json",

    limit: "2mb",
  }),

  handleRazorpayWebhook
);

/* =====================================
   Request parsing middleware
===================================== */

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,

    limit: "10mb",
  })
);

app.use(
  cookieParser()
);

/* =====================================
   API status routes

   These stay outside the rate limiter
   for deployment health monitoring.
===================================== */

app.get(
  "/",
  (
    req,
    res
  ) => {
    return res
      .status(200)
      .json({
        success: true,

        message:
          "HHS Backend API is running",

        company:
          "VeeraWebTech",

        environment:
          process.env
            .NODE_ENV ||
          "development",

        timestamp:
          new Date().toISOString(),
      });
  }
);

app.get(
  "/api/health",
  (
    req,
    res
  ) => {
    const databaseConnected =
      mongoose.connection
        .readyState === 1;

    const paymentsConfigured =
      Boolean(
        process.env
          .RAZORPAY_KEY_ID &&
          process.env
            .RAZORPAY_KEY_SECRET
      );

    const payoutKeyId =
      process.env
        .RAZORPAYX_KEY_ID ||
      process.env
        .RAZORPAY_KEY_ID;

    const payoutKeySecret =
      process.env
        .RAZORPAYX_KEY_SECRET ||
      process.env
        .RAZORPAY_KEY_SECRET;

    const payoutsConfigured =
      Boolean(
        payoutKeyId &&
        payoutKeySecret
      );

    return res
      .status(
        databaseConnected
          ? 200
          : 503
      )
      .json({
        success:
          databaseConnected,

        status:
          databaseConnected
            ? "healthy"
            : "unhealthy",

        database:
          databaseConnected
            ? "connected"
            : "disconnected",

        paymentsConfigured,

        payoutsConfigured,

        timestamp:
          new Date().toISOString(),
      });
  }
);

/* =====================================
   API rate limiting
===================================== */

/*
 * Protect all API endpoints with a
 * generous general request limit.
 */

app.use(
  "/api",
  generalApiLimiter
);

/*
 * Apply the stricter failed-login
 * limiter before authRoutes.
 */

app.post(
  "/api/auth/login",
  loginLimiter
);

/* =====================================
   Application routes
===================================== */

/* Authentication and profile */

app.use(
  "/api/auth",
  authenticationLimiter,
  authRoutes
);

/* Public and managed properties */

app.use(
  "/api/properties",
  propertyRoutes
);

/* Customer and managed bookings */

app.use(
  "/api/bookings",
  bookingRoutes
);

/* Razorpay payments and receipts */

app.use(
  "/api/payments",
  paymentLimiter,
  paymentRoutes
);

/* Owner payout accounts */

app.use(
  "/api/payout-accounts",
  payoutAccountRoutes
);

/* Guest reviews and moderation */

app.use(
  "/api/reviews",
  reviewRoutes
);

/* Customer saved properties */

app.use(
  "/api/saved-properties",
  savedPropertyRoutes
);

/* Customer support tickets */

app.use(
  "/api/support-tickets",
  supportTicketRoutes
);

/* Staff management */

app.use(
  "/api/staff",
  staffRoutes
);

/* Super Admin dashboard */

app.use(
  "/api/admin",
  adminRoutes
);

/* Customer and owner management */

app.use(
  "/api/users",
  userManagementRoutes
);

/* =====================================
   Route not found
===================================== */

app.use(
  (
    req,
    res
  ) => {
    return res
      .status(404)
      .json({
        success: false,

        message:
          `Route not found: ${req.method} ${req.originalUrl}`,
      });
  }
);

/* =====================================
   Global error handler
===================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "Server error:",
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    /* Invalid JSON request body */

    if (
      error instanceof
        SyntaxError &&
      error.status === 400 &&
      "body" in error
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "The request contains invalid JSON.",
        });
    }

    /* Invalid MongoDB ObjectId */

    if (
      error.name ===
      "CastError"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Invalid resource ID.",
        });
    }

    /* Duplicate MongoDB value */

    if (
      error.code === 11000
    ) {
      const duplicateField =
        Object.keys(
          error.keyValue ||
            {}
        )[0];

      return res
        .status(409)
        .json({
          success: false,

          message:
            duplicateField
              ? `${duplicateField} already exists.`
              : "Duplicate value already exists.",
        });
    }

    /* Mongoose validation */

    if (
      error.name ===
      "ValidationError"
    ) {
      const messages =
        Object.values(
          error.errors ||
            {}
        ).map(
          (
            validationError
          ) => {
            return validationError.message;
          }
        );

      return res
        .status(400)
        .json({
          success: false,

          message:
            messages.join(
              ", "
            ) ||
            "Validation failed.",
        });
    }

    const statusCode =
      Number(
        error.status ||
          error.statusCode
      ) || 500;

    const shouldExposeMessage =
      statusCode < 500 ||
      process.env.NODE_ENV !==
        "production";

    return res
      .status(statusCode)
      .json({
        success: false,

        message:
          shouldExposeMessage
            ? error.message ||
              "Unable to complete the request."
            : "Internal server error.",
      });
  }
);

export default app;