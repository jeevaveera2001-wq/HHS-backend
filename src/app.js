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

import { handleRazorpayWebhook } from "./controllers/paymentController.js";

/* =====================================
   Rate limit middleware
===================================== */

import {
  authenticationLimiter,
  generalApiLimiter,
  loginLimiter,
  paymentLimiter,
} from "./middleware/rateLimitMiddleware.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* =====================================
   Proxy configuration
===================================== */

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/* =====================================
   Security
===================================== */
app.use(morgan('combined')); // Now it catches everything!
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/* =====================================
   CORS Configuration
===================================== */

const normalizeOrigin = (origin) =>
  origin.trim().replace(/\/+$/, "");

const allowedOrigins = [
  "https://hogenakkalhomestays.com",
  "https://www.hogenakkalhomestays.com",
  "http://localhost:5173",
];

if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(",")
    .map((origin) => normalizeOrigin(origin))
    .forEach((origin) => {
      if (!allowedOrigins.includes(origin)) {
        allowedOrigins.push(origin);
      }
    });
}

const corsOptions = {
  origin(origin, callback) {
    // Allow Postman, mobile apps and server-to-server requests
    if (!origin) {
      return callback(null, true);
    }

    const requestOrigin = normalizeOrigin(origin);

    if (allowedOrigins.includes(requestOrigin)) {
      return callback(null, true);
    }

    console.error("Blocked by CORS:", requestOrigin);

    return callback(
      new Error("Origin not allowed by CORS")
    );
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

app.use(
    "/uploads",
    express.static(path.join(__dirname, "uploads"))
);

/* =====================================
   Logging
===================================== */


/* =====================================
   Razorpay Webhook
===================================== */

app.post(
  "/api/payments/webhook",
  express.raw({
    type: "application/json",
    limit: "2mb",
  }),
  handleRazorpayWebhook
);

/* =====================================
   Body Parser
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

app.use(cookieParser());

/* =====================================
   Status Routes
===================================== */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "HHS Backend API is running",
    company: "VeeraWebTech",
    environment:
      process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  const databaseConnected =
    mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    status: databaseConnected
      ? "healthy"
      : "unhealthy",
    database: databaseConnected
      ? "connected"
      : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

/* =====================================
   API Rate Limiting
===================================== */

app.use("/api", generalApiLimiter);


app.post(
  "/api/auth/login",
  loginLimiter
);

/* =====================================
   Authentication Routes
===================================== */

app.use(
  "/api/auth",
  authenticationLimiter,
  authRoutes
);

/* =====================================
   Property Routes
===================================== */

app.use(
  "/api/properties",
  propertyRoutes
);

/* =====================================
   Booking Routes
===================================== */

app.use(
  "/api/bookings",
  bookingRoutes
);

/* =====================================
   Payment Routes
===================================== */

app.use(
  "/api/payments",
  paymentLimiter,
  paymentRoutes
);

/* =====================================
   Staff Routes
===================================== */

app.use(
  "/api/staff",
  staffRoutes
);

/* =====================================
   Admin Routes
===================================== */

app.use(
  "/api/admin",
  adminRoutes
);

/* =====================================
   User Management Routes
===================================== */

app.use(
  "/api/users",
  userManagementRoutes
);

/* =====================================
   Saved Property Routes
===================================== */

app.use(
  "/api/saved-properties",
  savedPropertyRoutes
);

/* =====================================
   Review Routes
===================================== */

app.use(
  "/api/reviews",
  reviewRoutes
);

/* =====================================
   Payout Account Routes
===================================== */

app.use(
  "/api/payout-accounts",
  payoutAccountRoutes
);

/* =====================================
   Support Ticket Routes
===================================== */

app.use(
  "/api/support",
  supportTicketRoutes
);

/* =====================================
   404 Route Handler
===================================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

/* =====================================
   Global Error Handler
===================================== */

app.use((err, req, res, next) => {
  console.error("Global Error:", err);

  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid resource ID.",
    });
  }

  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Authentication token has expired.",
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Duplicate record found.",
    });
  }

  return res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : err.message,
    ...(process.env.NODE_ENV !== "production" && {
      stack: err.stack,
    }),
  });
});

/* =====================================
   Export Express App
===================================== */

export default app;