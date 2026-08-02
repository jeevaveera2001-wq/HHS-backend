import jwt from "jsonwebtoken";

import User from "../models/User.js";

/* =====================================================
   Get token from request
===================================================== */

const getTokenFromRequest = (
  req
) => {
  const authorizationHeader =
    req.headers.authorization;

  if (
    typeof authorizationHeader ===
    "string"
  ) {
    const [
      authenticationType,
      token,
    ] = authorizationHeader
      .trim()
      .split(/\s+/);

    if (
      authenticationType
        ?.toLowerCase() ===
        "bearer" &&
      token
    ) {
      return token;
    }
  }

  if (
    typeof req.cookies?.token ===
      "string" &&
    req.cookies.token
  ) {
    return req.cookies.token;
  }

  return null;
};

/* =====================================================
   Verify JWT
===================================================== */

const verifyToken = (
  token
) => {
  return jwt.verify(
    token,
    process.env.JWT_SECRET,
    {
      algorithms: [
        "HS256",
      ],
    }
  );
};

/* =====================================================
   Get user ID from token
===================================================== */

const getUserIdFromToken = (
  decodedToken
) => {
  return (
    decodedToken.id ||
    decodedToken.userId ||
    decodedToken._id ||
    null
  );
};

/* =====================================================
   Check token version

   Tokens created before this feature do not contain a
   version, so they safely default to version 0.
===================================================== */

const tokenVersionMatches = (
  decodedToken,
  user
) => {
  const tokenVersion =
    Number(
      decodedToken
        .tokenVersion ?? 0
    );

  const currentUserVersion =
    Number(
      user.tokenVersion ?? 0
    );

  return (
    Number.isFinite(
      tokenVersion
    ) &&
    tokenVersion ===
      currentUserVersion
  );
};

/* =====================================================
   Find authenticated user
===================================================== */

const findAuthenticatedUser =
  async (
    decodedToken
  ) => {
    const userId =
      getUserIdFromToken(
        decodedToken
      );

    if (!userId) {
      return null;
    }

    return User.findById(
      userId
    ).select(
      "+tokenVersion"
    );
  };

/* =====================================================
   Attach authentication information
===================================================== */

const attachAuthentication = (
  req,
  user,
  decodedToken,
  token
) => {
  req.user = user;

  req.auth = {
    token,

    issuedAt:
      decodedToken.iat ||
      null,

    expiresAt:
      decodedToken.exp ||
      null,

    tokenVersion:
      Number(
        decodedToken
          .tokenVersion ?? 0
      ),
  };
};

/* =====================================================
   Protect authenticated routes
===================================================== */

export const protect = async (
  req,
  res,
  next
) => {
  try {
    const token =
      getTokenFromRequest(req);

    if (!token) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Authentication required. Please login.",
        });
    }

    if (
      !process.env.JWT_SECRET
    ) {
      console.error(
        "JWT_SECRET is not configured."
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Authentication configuration error.",
        });
    }

    const decodedToken =
      verifyToken(token);

    const user =
      await findAuthenticatedUser(
        decodedToken
      );

    if (!user) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "The user associated with this token no longer exists.",
        });
    }

    if (
      user.isActive ===
      false
    ) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            "Your account has been deactivated.",
        });
    }

    if (
      !tokenVersionMatches(
        decodedToken,
        user
      )
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Your session is no longer valid. Please login again.",
        });
    }

    attachAuthentication(
      req,
      user,
      decodedToken,
      token
    );

    return next();
  } catch (error) {
    if (
      error.name ===
      "TokenExpiredError"
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Your session has expired. Please login again.",
        });
    }

    if (
      error.name ===
        "JsonWebTokenError" ||
      error.name ===
        "NotBeforeError"
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Invalid authentication token.",
        });
    }

    console.error(
      "Authentication error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Unable to authenticate the request.",
      });
  }
};

/* =====================================================
   Authorize specific roles
===================================================== */

export const authorizeRoles = (
  ...allowedRoles
) => {
  return (
    req,
    res,
    next
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Authentication required.",
        });
    }

    if (
      !allowedRoles.includes(
        req.user.role
      )
    ) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            "You do not have permission to perform this action.",
        });
    }

    return next();
  };
};

/* =====================================================
   Optional authentication
===================================================== */

export const optionalAuth =
  async (
    req,
    res,
    next
  ) => {
    try {
      const token =
        getTokenFromRequest(
          req
        );

      if (
        !token ||
        !process.env
          .JWT_SECRET
      ) {
        return next();
      }

      const decodedToken =
        verifyToken(token);

      const user =
        await findAuthenticatedUser(
          decodedToken
        );

      if (
        user &&
        user.isActive !==
          false &&
        tokenVersionMatches(
          decodedToken,
          user
        )
      ) {
        attachAuthentication(
          req,
          user,
          decodedToken,
          token
        );
      }

      return next();
    } catch {
      /*
       * Invalid optional tokens do not
       * block public routes.
       */

      return next();
    }
  };

/* =====================================================
   Convenience middleware
===================================================== */

export const adminOnly =
  authorizeRoles(
    "admin",
    "super_admin"
  );

export const superAdminOnly =
  authorizeRoles(
    "super_admin"
  );

/* =====================================================
   Default export
===================================================== */

export default protect;