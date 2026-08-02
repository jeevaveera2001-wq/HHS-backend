import {
  ROLE_PERMISSIONS,
} from "../config/permissions.js";

/* =====================================
   Authorize specific roles
===================================== */

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to access this resource.",
      });
    }

    next();
  };
};

/* =====================================
   Require every specified permission
===================================== */

export const requirePermission = (
  ...requiredPermissions
) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const rolePermissions =
      ROLE_PERMISSIONS[req.user.role] || [];

    const customPermissions =
      req.user.customPermissions || [];

    const revokedPermissions =
      req.user.revokedPermissions || [];

    const effectivePermissions = [
      ...new Set([
        ...rolePermissions,
        ...customPermissions,
      ]),
    ].filter(
      (permission) =>
        !revokedPermissions.includes(permission)
    );

    const hasPermission = requiredPermissions.every(
      (permission) =>
        effectivePermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have the required permission for this action.",
        requiredPermissions,
      });
    }

    req.userPermissions = effectivePermissions;

    next();
  };
};

/* =====================================
   Require at least one permission
===================================== */

export const requireAnyPermission = (
  ...requiredPermissions
) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const rolePermissions =
      ROLE_PERMISSIONS[req.user.role] || [];

    const customPermissions =
      req.user.customPermissions || [];

    const revokedPermissions =
      req.user.revokedPermissions || [];

    const effectivePermissions = [
      ...new Set([
        ...rolePermissions,
        ...customPermissions,
      ]),
    ].filter(
      (permission) =>
        !revokedPermissions.includes(permission)
    );

    const hasPermission = requiredPermissions.some(
      (permission) =>
        effectivePermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission for this action.",
        requiredPermissions,
      });
    }

    req.userPermissions = effectivePermissions;

    next();
  };
};

/* =====================================
   Attach permissions without blocking
===================================== */

export const attachPermissions = (req, res, next) => {
  if (!req.user) {
    req.userPermissions = [];
    return next();
  }

  const rolePermissions =
    ROLE_PERMISSIONS[req.user.role] || [];

  const customPermissions =
    req.user.customPermissions || [];

  const revokedPermissions =
    req.user.revokedPermissions || [];

  req.userPermissions = [
    ...new Set([
      ...rolePermissions,
      ...customPermissions,
    ]),
  ].filter(
    (permission) =>
      !revokedPermissions.includes(permission)
  );

  next();
};