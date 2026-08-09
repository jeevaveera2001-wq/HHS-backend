import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

import path from "node:path";
import {
  fileURLToPath,
} from "node:url";

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
import contactEnquiryRoutes from "./routes/contactEnquiryRoutes.js";
import ownerRequestRoutes from "./routes/ownerRequestRoutes.js";

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

/* =====================================
   Directory configuration
===================================== */

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const app = express();

/* =====================================
   Proxy configuration
===================================== */

if (
  process.env.NODE_ENV ===
  "production"
) {
  app.set("trust proxy", 1);
}

/* =====================================
   Security and logging
===================================== */

app.disable("x-powered-by");

app.use(
  morgan(
    process.env.NODE_ENV ===
      "production"
      ? "combined"
      : "dev"
  )
);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/* =====================================
   CORS configuration
===================================== */

const normalizeOrigin = (
  origin = ""
) => {
  return origin
    .trim()
    .replace(/\/+$/, "");
};

const allowedOrigins = [
  "https://hogenakkalhomestays.com",
  "https://www.hogenakkalhomestays.com",
  "http://localhost:5173",
].map(normalizeOrigin);

if (
  process.env.FRONTEND_URL?.trim()
) {
  process.env.FRONTEND_URL
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean)
    .forEach((origin) => {
      if (
        !allowedOrigins.includes(
          origin
        )
      ) {
        allowedOrigins.push(origin);
      }
    });
}

const corsOptions = {
  origin(origin, callback) {
    /*
     * Requests from Postman,
     * mobile applications and
     * server-to-server clients may
     * not contain an Origin header.
     */
    if (!origin) {
      return callback(null, true);
    }

    const requestOrigin =
      normalizeOrigin(origin);

    if (
      allowedOrigins.includes(
        requestOrigin
      )
    ) {
      return callback(null, true);
    }

    console.error(
      "Blocked by CORS:",
      requestOrigin
    );

    const corsError = new Error(
      "Origin not allowed by CORS"
    );

    corsError.status = 403;

    return callback(corsError);
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

app.use(cors(corsOptions));

/* =====================================
   Static uploads
===================================== */

app.use(
  "/uploads",
  express.static(
    path.join(
      __dirname,
      "uploads"
    )
  )
);

/* =====================================
   Razorpay webhook
===================================== */

/*
 * This webhook must be registered
 * before express.json() because
 * Razorpay signature verification
 * requires the raw request body.
 */
app.post(
  "/api/payments/webhook",
  express.raw({
    type: "application/json",
    limit: "2mb",
  }),
  handleRazorpayWebhook
);

/* =====================================
   Body parsers
===================================== */

app.use(
  express.json({
    limit: "50mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

app.use(cookieParser());

/* =====================================
   Status routes
===================================== */

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message:
      "HHS Backend API is running",
    company: "VeeraWebTech",
    environment:
      process.env.NODE_ENV ||
      "development",
    timestamp:
      new Date().toISOString(),
  });
});

app.get(
  "/api/health",
  (req, res) => {
    const databaseConnected =
      mongoose.connection
        .readyState === 1;

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

        timestamp:
          new Date().toISOString(),
      });
  }
);

/* =====================================
   API rate limiting
===================================== */

app.use(
  "/api",
  generalApiLimiter
);

app.post(
  "/api/auth/login",
  loginLimiter
);

/* =====================================
   Authentication routes
===================================== */

app.use(
  "/api/auth",
  authenticationLimiter,
  authRoutes
);

/* =====================================
   Property routes
===================================== */

app.use(
  "/api/properties",
  propertyRoutes
);

/* =====================================
   Booking routes
===================================== */

app.use(
  "/api/bookings",
  bookingRoutes
);

/* =====================================
   Payment routes
===================================== */

app.use(
  "/api/payments",
  paymentLimiter,
  paymentRoutes
);

/* =====================================
   Staff routes
===================================== */

app.use(
  "/api/staff",
  staffRoutes
);

/* =====================================
   Admin routes
===================================== */

app.use(
  "/api/admin",
  adminRoutes
);

/* =====================================
   User-management routes
===================================== */

app.use(
  "/api/users",
  userManagementRoutes
);

/* =====================================
   Saved-property routes
===================================== */

app.use(
  "/api/saved-properties",
  savedPropertyRoutes
);

/* =====================================
   Review routes
===================================== */

app.use(
  "/api/reviews",
  reviewRoutes
);

/* =====================================
   Payout-account routes
===================================== */

app.use(
  "/api/payout-accounts",
  payoutAccountRoutes
);

/* =====================================
   Support-ticket routes
===================================== */

app.use(
  "/api/support-tickets",
  supportTicketRoutes
);

/* =====================================
   Contact-enquiry routes
===================================== */

app.use(
  "/api/contact-enquiries",
  contactEnquiryRoutes
);

/* =====================================
   Owner-request routes
===================================== */

/*
 * Customer:
 * POST /api/owner-requests
 * GET  /api/owner-requests/my-requests
 *
 * Administrator:
 * GET   /api/owner-requests
 * GET   /api/owner-requests/:id
 * PATCH /api/owner-requests/:id/review
 */
app.use(
  "/api/owner-requests",
  ownerRequestRoutes
);

/* =====================================
   404 route handler
===================================== */

/*
 * This handler must remain after all
 * application routes.
 */
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message:
      `Route not found: ${req.originalUrl}`,
  });
});

/* =====================================
   Global error handler
===================================== */

/*
 * Express recognizes this as an error
 * handler because all four arguments
 * are present.
 */
app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "Global Error:",
      err
    );

    if (
      err.message ===
      "Origin not allowed by CORS"
    ) {
      return res.status(403).json({
        success: false,
        message: err.message,
      });
    }

    if (
      err.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    if (err.name === "CastError") {
      return res.status(400).json({
        success: false,
        message:
          "Invalid resource ID.",
      });
    }

    if (
      err.name ===
      "JsonWebTokenError"
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid authentication token.",
      });
    }

    if (
      err.name ===
      "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication token has expired.",
      });
    }

    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Duplicate record found.",
      });
    }

    return res
      .status(err.status || 500)
      .json({
        success: false,

        message:
          process.env.NODE_ENV ===
          "production"
            ? "Internal Server Error"
            : err.message,

        ...(process.env.NODE_ENV !==
          "production" && {
          stack: err.stack,
        }),
      });
  }
);

/* =====================================
   Export Express application
===================================== */

export default app;