import "dotenv/config";

import mongoose from "mongoose";

import app from "./app.js";

/* =====================================
   Server configuration
===================================== */

const parsedPort =
  Number.parseInt(
    process.env.PORT || "5000",
    10
  );

const PORT =
  Number.isInteger(parsedPort) &&
  parsedPort > 0 &&
  parsedPort <= 65535
    ? parsedPort
    : 5000;

let server = null;

let shuttingDown = false;

/* =====================================
   Environment validation
===================================== */

const validateEnvironment = () => {
  const requiredVariables = [
    "MONGO_URI",
    "JWT_SECRET",
  ];

  const missingVariables =
    requiredVariables.filter(
      (variableName) => {
        return !process.env[
          variableName
        ]?.trim();
      }
    );

  if (
    missingVariables.length > 0
  ) {
    throw new Error(
      `Missing required environment variable(s): ${missingVariables.join(
        ", "
      )}`
    );
  }

  if (
    process.env.NODE_ENV ===
      "production" &&
    !process.env.FRONTEND_URL
  ) {
    console.warn(
      "Warning: FRONTEND_URL is not configured for production."
    );
  }
};

/* =====================================
   Start backend server
===================================== */

const startServer = async () => {
  try {
    validateEnvironment();

    await mongoose.connect(
      process.env.MONGO_URI,
      {
        serverSelectionTimeoutMS:
          15000,

        connectTimeoutMS:
          15000,

        socketTimeoutMS:
          45000,

        maxPoolSize: 20,

        minPoolSize: 1,
      }
    );

    console.log(
      `MongoDB connected successfully: ${mongoose.connection.host}`
    );

    server = app.listen(
      PORT,
      () => {
        console.log(
          `HHS Backend running on http://localhost:${PORT}`
        );

        console.log(
          `Environment: ${
            process.env.NODE_ENV ||
            "development"
          }`
        );
      }
    );

    server.keepAliveTimeout =
      65000;

    server.headersTimeout =
      66000;

    server.requestTimeout =
      120000;
  } catch (error) {
    console.error(
      "Backend startup failed:",
      error.message
    );

    if (
      mongoose.connection
        .readyState !== 0
    ) {
      await mongoose
        .disconnect()
        .catch(() => null);
    }

    process.exit(1);
  }
};

/* =====================================
   Graceful shutdown
===================================== */

const shutdownServer = async (
  signal,
  exitCode = 0
) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    `${signal} received. Shutting down HHS Backend...`
  );

  const forceShutdownTimer =
    setTimeout(() => {
      console.error(
        "Forced shutdown after timeout."
      );

      process.exit(1);
    }, 10000);

  forceShutdownTimer.unref();

  try {
    if (server) {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          server.close(
            (error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            }
          );
        }
      );

      console.log(
        "HTTP server closed."
      );
    }

    if (
      mongoose.connection
        .readyState !== 0
    ) {
      await mongoose.disconnect();

      console.log(
        "MongoDB connection closed."
      );
    }

    clearTimeout(
      forceShutdownTimer
    );

    console.log(
      "HHS Backend shutdown completed."
    );

    process.exit(exitCode);
  } catch (error) {
    clearTimeout(
      forceShutdownTimer
    );

    console.error(
      "Backend shutdown failed:",
      error.message
    );

    process.exit(1);
  }
};

/* =====================================
   MongoDB connection events
===================================== */

mongoose.connection.on(
  "connected",
  () => {
    console.log(
      "MongoDB connection established."
    );
  }
);

mongoose.connection.on(
  "disconnected",
  () => {
    if (!shuttingDown) {
      console.warn(
        "MongoDB disconnected unexpectedly."
      );
    }
  }
);

mongoose.connection.on(
  "reconnected",
  () => {
    console.log(
      "MongoDB reconnected."
    );
  }
);

mongoose.connection.on(
  "error",
  (error) => {
    console.error(
      "MongoDB connection error:",
      error.message
    );
  }
);

/* =====================================
   Process events
===================================== */

process.on(
  "SIGTERM",
  () => {
    shutdownServer(
      "SIGTERM",
      0
    );
  }
);

process.on(
  "SIGINT",
  () => {
    shutdownServer(
      "SIGINT",
      0
    );
  }
);

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "Unhandled promise rejection:",
      reason
    );

    shutdownServer(
      "Unhandled rejection",
      1
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught exception:",
      error
    );

    shutdownServer(
      "Uncaught exception",
      1
    );
  }
);

/* =====================================
   Start application
===================================== */

startServer();