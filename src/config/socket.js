import {
  Server,
} from "socket.io";

import Property from "../models/Property.js";

let socketServer = null;
let propertyChangeStream = null;

const normalizeOrigin = (origin) => {
  return origin
    ?.trim()
    .replace(/\/+$/, "");
};

const getAllowedOrigins = () => {
  const origins = [
    "https://hogenakkalhomestays.com",
    "https://www.hogenakkalhomestays.com",
    "http://localhost:5173",
  ];

  if (process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean)
      .forEach((origin) => {
        if (!origins.includes(origin)) {
          origins.push(origin);
        }
      });
  }

  return origins;
};

/* =====================================
   Initialize Socket.IO
===================================== */

export const initializeSocket = (
  httpServer
) => {
  socketServer = new Server(
    httpServer,
    {
      cors: {
        origin:
          getAllowedOrigins(),

        credentials: true,

        methods: [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
        ],
      },

      transports: [
        "websocket",
        "polling",
      ],

      serveClient: false,

      pingInterval: 25000,
      pingTimeout: 20000,
    }
  );

  socketServer.on(
    "connection",
    (socket) => {
      console.log(
        "Realtime client connected:",
        socket.id
      );

      socket.emit(
        "realtime:connected",
        {
          success: true,
          timestamp:
            new Date().toISOString(),
        }
      );

      socket.on(
        "disconnect",
        (reason) => {
          console.log(
            "Realtime client disconnected:",
            socket.id,
            reason
          );
        }
      );
    }
  );

  return socketServer;
};

/* =====================================
   Broadcast property database changes
===================================== */

export const startPropertyChangeStream =
  () => {
    if (!socketServer) {
      throw new Error(
        "Socket.IO must be initialized before starting the property change stream."
      );
    }

    if (propertyChangeStream) {
      return propertyChangeStream;
    }

    try {
      propertyChangeStream =
        Property.watch(
          [],
          {
            fullDocument:
              "updateLookup",
          }
        );

      propertyChangeStream.on(
        "change",
        (change) => {
          const property =
            change.fullDocument ||
            null;

          const propertyId =
            property?._id ||
            change.documentKey?._id ||
            null;

          socketServer.emit(
            "property:changed",
            {
              operationType:
                change.operationType,

              propertyId:
                propertyId
                  ? String(
                      propertyId
                    )
                  : null,

              approvalStatus:
                property
                  ?.approvalStatus ||
                null,

              isActive:
                property?.isActive ??
                null,

              isFeatured:
                property?.isFeatured ??
                null,

              changedAt:
                new Date()
                  .toISOString(),
            }
          );

          console.log(
            "Property realtime event emitted:",
            change.operationType,
            propertyId
          );
        }
      );

      propertyChangeStream.on(
        "error",
        (error) => {
          console.error(
            "Property change-stream error:",
            error
          );

          propertyChangeStream =
            null;
        }
      );

      propertyChangeStream.on(
        "close",
        () => {
          console.warn(
            "Property change stream closed."
          );

          propertyChangeStream =
            null;
        }
      );

      console.log(
        "Property realtime change stream started."
      );

      return propertyChangeStream;
    } catch (error) {
      console.error(
        "Unable to start property change stream:",
        error
      );

      propertyChangeStream = null;

      return null;
    }
  };

/* =====================================
   Close realtime services
===================================== */

export const closeSocketServices =
  async () => {
    if (propertyChangeStream) {
      await propertyChangeStream
        .close()
        .catch(() => null);

      propertyChangeStream =
        null;
    }

    if (socketServer) {
      await new Promise(
        (resolve) => {
          socketServer.close(
            resolve
          );
        }
      );

      socketServer = null;
    }
  };

export const getSocketServer = () => {
  return socketServer;
};