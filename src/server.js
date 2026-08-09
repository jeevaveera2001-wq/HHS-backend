import "dotenv/config";

import {
  createServer,
} from "node:http";

import mongoose from "mongoose";

import app from "./app.js";

import {
  closeSocketServices,
  initializeSocket,
  startPropertyChangeStream,
} from "./config/socket.js";

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
    !process.env.FRONTEND_URL?.trim()
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

    /*
     * Socket.IO must use the same
     * HTTP server as Express.
     */
    server = createServer(app);

    initializeSocket(server);

    /*
     * MongoDB Atlas supports change
     * streams because it uses a
     * replica set.
     */
    startPropertyChangeStream();

    server.listen(PORT, () => {
      console.log(
        `HHS Backend running on port ${PORT}`
      );

      console.log(
        `Environment: ${
          process.env.NODE_ENV ||
          "development"
        }`
      );

      console.log(
        "HHS realtime property updates enabled."
      );

      console.log(
        "Owner request API enabled at /api/owner-requests"
      );
    });

    server.keepAliveTimeout =
      65000;

    server.headersTimeout =
      66000;

    server.requestTimeout =
      120000;
  } catch (error) {
    console.error(
      "Backend startup failed:",
      error
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
    await closeSocketServices();

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
      error
    );

    process.exit(1);
  }
};

/* =====================================
   MongoDB events
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
      error
    );
  }
);

/* =====================================
   Process events
===================================== */

process.on(
  "SIGTERM",
  () => {
    void shutdownServer(
      "SIGTERM",
      0
    );
  }
);

process.on(
  "SIGINT",
  () => {
    void shutdownServer(
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

    void shutdownServer(
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

    void shutdownServer(
      "Uncaught exception",
      1
    );
  }
);

/* =====================================
   Start application
===================================== */

void startServer();