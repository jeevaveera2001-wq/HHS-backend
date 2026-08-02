import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/User.js";
import {
  PERMISSIONS,
} from "../config/permissions.js";

const STAFF_ROLES = [
  "support",
  "property_admin",
  "booking_manager",
  "finance_manager",
  "operations_manager",
];

const isValidId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const isValidPermission = (permission) => {
  return Object.values(PERMISSIONS).includes(permission);
};

/* =====================================
   Get all staff members
===================================== */

export const getStaffMembers = async (req, res) => {
  try {
    const {
      search,
      role,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {
      role: {
        $in: [
          ...STAFF_ROLES,
          "super_admin",
        ],
      },
    };

    if (search?.trim()) {
      const searchPattern = {
        $regex: search.trim(),
        $options: "i",
      };

      query.$or = [
        {
          fullName: searchPattern,
        },
        {
          email: searchPattern,
        },
        {
          phone: searchPattern,
        },
      ];
    }

    if (
      role &&
      [
        ...STAFF_ROLES,
        "super_admin",
      ].includes(role)
    ) {
      query.role = role;
    }

    if (status === "active") {
      query.isActive = true;
    }

    if (status === "inactive") {
      query.isActive = false;
    }

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const pageLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (currentPage - 1) * pageLimit;

    const [
      staffMembers,
      totalStaff,
    ] = await Promise.all([
      User.find(query)
        .select("-savedProperties")
        .populate(
          "createdBy",
          "fullName email role"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(pageLimit),

      User.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: staffMembers.length,
      totalStaff,
      currentPage,
      totalPages: Math.ceil(
        totalStaff / pageLimit
      ),
      staffMembers,
    });
  } catch (error) {
    console.error(
      "Get staff members error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load staff members.",
    });
  }
};

/* =====================================
   Create staff account
===================================== */

export const createStaffMember = async (
  req,
  res
) => {
  try {
    const fullName =
      req.body.fullName?.trim();

    const email =
      req.body.email
        ?.trim()
        .toLowerCase();

    const phone =
      req.body.phone?.trim();

    const password = req.body.password;
    const role = req.body.role;

    const requestedPermissions =
      req.body.customPermissions || [];

    if (
      !fullName ||
      !email ||
      !phone ||
      !password ||
      !role
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, email, phone, password and role are required.",
      });
    }

    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff role.",
      });
    }

    if (password.length < 10) {
      return res.status(400).json({
        success: false,
        message:
          "Staff password must contain at least 10 characters.",
      });
    }

    if (!Array.isArray(requestedPermissions)) {
      return res.status(400).json({
        success: false,
        message:
          "Custom permissions must be an array.",
      });
    }

    const invalidPermissions =
      requestedPermissions.filter(
        (permission) =>
          !isValidPermission(permission)
      );

    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid custom permissions.",
        invalidPermissions,
      });
    }

    const existingUser = await User.findOne({
      $or: [
        {
          email,
        },
        {
          phone,
        },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,

        message:
          existingUser.email === email
            ? "Email address is already registered."
            : "Phone number is already registered.",
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 12);

    const staffMember = await User.create({
      fullName,
      email,
      phone,
      password: hashedPassword,
      role,
      customPermissions: [
        ...new Set(requestedPermissions),
      ],
      revokedPermissions: [],
      isActive: true,
      isVerified: true,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Staff account created successfully.",

      staffMember: {
        id: staffMember._id,
        fullName: staffMember.fullName,
        email: staffMember.email,
        phone: staffMember.phone,
        role: staffMember.role,
        customPermissions:
          staffMember.customPermissions,
        isActive: staffMember.isActive,
        isVerified: staffMember.isVerified,
        createdAt: staffMember.createdAt,
      },
    });
  } catch (error) {
    console.error(
      "Create staff member error:",
      error
    );

    if (error.name === "ValidationError") {
      const message = Object.values(
        error.errors
      )
        .map((item) => item.message)
        .join(", ");

      return res.status(400).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create staff account.",
    });
  }
};

/* =====================================
   Update staff details and role
===================================== */

export const updateStaffMember = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID.",
      });
    }

    const staffMember =
      await User.findById(id);

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    if (staffMember.role === "super_admin") {
      return res.status(403).json({
        success: false,
        message:
          "The Super Admin account cannot be modified here.",
      });
    }

    if (
      !STAFF_ROLES.includes(staffMember.role)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The selected user is not a staff member.",
      });
    }

    const {
      fullName,
      phone,
      role,
    } = req.body;

    if (fullName !== undefined) {
      const normalizedName =
        fullName.trim();

      if (!normalizedName) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot be empty.",
        });
      }

      staffMember.fullName = normalizedName;
    }

    if (phone !== undefined) {
      const normalizedPhone =
        phone.trim();

      if (!normalizedPhone) {
        return res.status(400).json({
          success: false,
          message:
            "Phone number cannot be empty.",
        });
      }

      const phoneOwner =
        await User.findOne({
          phone: normalizedPhone,
          _id: {
            $ne: staffMember._id,
          },
        });

      if (phoneOwner) {
        return res.status(409).json({
          success: false,
          message:
            "Phone number is already in use.",
        });
      }

      staffMember.phone = normalizedPhone;
    }

    if (role !== undefined) {
      if (!STAFF_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid staff role.",
        });
      }

      staffMember.role = role;
    }

    await staffMember.save();

    return res.status(200).json({
      success: true,
      message: "Staff member updated successfully.",
      staffMember,
    });
  } catch (error) {
    console.error(
      "Update staff member error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update staff member.",
    });
  }
};

/* =====================================
   Update staff permissions
===================================== */

export const updateStaffPermissions = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const {
      customPermissions = [],
      revokedPermissions = [],
    } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID.",
      });
    }

    if (
      !Array.isArray(customPermissions) ||
      !Array.isArray(revokedPermissions)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Permissions must be provided as arrays.",
      });
    }

    const allRequestedPermissions = [
      ...customPermissions,
      ...revokedPermissions,
    ];

    const invalidPermissions =
      allRequestedPermissions.filter(
        (permission) =>
          !isValidPermission(permission)
      );

    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid permissions provided.",
        invalidPermissions,
      });
    }

    const staffMember =
      await User.findById(id);

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    if (staffMember.role === "super_admin") {
      return res.status(403).json({
        success: false,
        message:
          "Super Admin permissions cannot be changed.",
      });
    }

    if (
      !STAFF_ROLES.includes(staffMember.role)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The selected user is not a staff member.",
      });
    }

    staffMember.customPermissions = [
      ...new Set(customPermissions),
    ];

    staffMember.revokedPermissions = [
      ...new Set(revokedPermissions),
    ];

    await staffMember.save();

    return res.status(200).json({
      success: true,
      message:
        "Staff permissions updated successfully.",
      staffMember,
    });
  } catch (error) {
    console.error(
      "Update staff permissions error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update staff permissions.",
    });
  }
};

/* =====================================
   Activate or deactivate staff
===================================== */

export const toggleStaffStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID.",
      });
    }

    if (
      id === req.user._id.toString()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot deactivate your own account.",
      });
    }

    const staffMember =
      await User.findById(id);

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found.",
      });
    }

    if (staffMember.role === "super_admin") {
      return res.status(403).json({
        success: false,
        message:
          "The Super Admin cannot be deactivated.",
      });
    }

    if (
      !STAFF_ROLES.includes(staffMember.role)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The selected user is not a staff member.",
      });
    }

    staffMember.isActive =
      !staffMember.isActive;

    await staffMember.save();

    return res.status(200).json({
      success: true,

      message: staffMember.isActive
        ? "Staff account activated successfully."
        : "Staff account deactivated successfully.",

      staffMember,
    });
  } catch (error) {
    console.error(
      "Toggle staff status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update staff account status.",
    });
  }
};