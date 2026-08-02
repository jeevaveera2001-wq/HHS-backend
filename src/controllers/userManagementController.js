import mongoose from "mongoose";

import User from "../models/User.js";

const CUSTOMER_ROLES = [
  "customer",
  "owner",
];

const PROTECTED_ROLES = [
  "super_admin",
  "operations_manager",
  "property_admin",
  "booking_manager",
  "finance_manager",
  "support",
];

const isValidId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/* =====================================
   Get customers and owners
===================================== */

export const getUsers = async (req, res) => {
  try {
    const {
      search,
      role,
      status,
      verified,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {
      role: {
        $in: CUSTOMER_ROLES,
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

    if (CUSTOMER_ROLES.includes(role)) {
      query.role = role;
    }

    if (status === "active") {
      query.isActive = true;
    }

    if (status === "inactive") {
      query.isActive = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    }

    if (verified === "false") {
      query.isVerified = false;
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
      users,
      totalUsers,
      totalCustomers,
      totalOwners,
      activeUsers,
      verifiedUsers,
    ] = await Promise.all([
      User.find(query)
        .select(
          "fullName email phone role profileImage isActive isVerified lastLogin createdAt"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(pageLimit),

      User.countDocuments(query),

      User.countDocuments({
        role: "customer",
      }),

      User.countDocuments({
        role: "owner",
      }),

      User.countDocuments({
        role: {
          $in: CUSTOMER_ROLES,
        },
        isActive: true,
      }),

      User.countDocuments({
        role: {
          $in: CUSTOMER_ROLES,
        },
        isVerified: true,
      }),
    ]);

    return res.status(200).json({
      success: true,
      count: users.length,
      totalUsers,
      currentPage,
      totalPages: Math.ceil(
        totalUsers / pageLimit
      ),

      summary: {
        customers: totalCustomers,
        owners: totalOwners,
        active: activeUsers,
        verified: verifiedUsers,
      },

      users,
    });
  } catch (error) {
    console.error(
      "Get users error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load users.",
    });
  }
};

/* =====================================
   Get individual user
===================================== */

export const getUserById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await User.findById(id)
      .select(
        "fullName email phone role profileImage savedProperties isActive isVerified lastLogin createdAt updatedAt"
      )
      .populate(
        "savedProperties",
        "title propertyType location pricePerNight images approvalStatus isActive"
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (PROTECTED_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "Staff accounts must be managed from the staff panel.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(
      "Get user details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load user details.",
    });
  }
};

/* =====================================
   Change customer/owner role
===================================== */

export const updateUserRole = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (!CUSTOMER_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message:
          "Role must be customer or owner.",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (PROTECTED_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "Staff roles cannot be changed from the user panel.",
      });
    }

    user.role = role;

    /*
     * New owner accounts should be verified
     * before property approval.
     */
    if (role === "owner") {
      user.isVerified = false;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: `User role updated to ${role}.`,
      user,
    });
  } catch (error) {
    console.error(
      "Update user role error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update user role.",
    });
  }
};

/* =====================================
   Verify or unverify user
===================================== */

export const toggleUserVerification = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (PROTECTED_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "Staff verification cannot be changed here.",
      });
    }

    user.isVerified = !user.isVerified;

    await user.save();

    return res.status(200).json({
      success: true,

      message: user.isVerified
        ? "User verified successfully."
        : "User verification removed.",

      user,
    });
  } catch (error) {
    console.error(
      "Toggle verification error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update verification status.",
    });
  }
};

/* =====================================
   Activate or suspend user
===================================== */

export const toggleUserStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (
      id === req.user._id.toString()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot suspend your own account.",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (PROTECTED_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "Staff accounts must be managed from the staff panel.",
      });
    }

    user.isActive = !user.isActive;

    await user.save();

    return res.status(200).json({
      success: true,

      message: user.isActive
        ? "User account activated successfully."
        : "User account suspended successfully.",

      user,
    });
  } catch (error) {
    console.error(
      "Toggle user status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update user account status.",
    });
  }
};