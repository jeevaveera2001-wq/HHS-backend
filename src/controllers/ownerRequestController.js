import mongoose from "mongoose";

import OwnerRequest from "../models/OwnerRequest.js";
import User from "../models/User.js";

const getAuthenticatedUserId = (req) => {
  return req.user?._id || req.user?.id;
};

const normalizePhone = (phone = "") => {
  return String(phone).replace(/\s+/g, "").trim();
};

const isValidEmail = (email = "") => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/* ==========================================
   CREATE OWNER REQUEST
   POST /api/owner-requests
   Access: Authenticated customer
========================================== */

export const createOwnerRequest = async (
  req,
  res
) => {
  try {
    const applicantId =
      getAuthenticatedUserId(req);

    if (!applicantId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required. Please login.",
      });
    }

    const {
      fullName,
      email,
      phone,
      propertyName,
      propertyType,
      propertyLocation,
      message,
    } = req.body;

    if (
      !fullName?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !propertyName?.trim() ||
      !propertyType ||
      !propertyLocation?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please complete all required fields.",
      });
    }

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    const normalizedPhone =
      normalizePhone(phone);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid email address.",
      });
    }

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid 10-digit mobile number.",
      });
    }

    const allowedPropertyTypes = [
      "homestay",
      "hotel",
      "resort",
      "guest-house",
    ];

    if (
      !allowedPropertyTypes.includes(propertyType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid property type.",
      });
    }

    const user = await User.findById(applicantId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (
      user.role === "owner" ||
      user.role === "admin" ||
      user.role === "super_admin"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Your account already has property management access.",
      });
    }

    const existingPendingRequest =
      await OwnerRequest.findOne({
        applicant: applicantId,
        status: "pending",
      });

    if (existingPendingRequest) {
      return res.status(409).json({
        success: false,
        message:
          "You already have a pending owner request.",
        request: existingPendingRequest,
      });
    }

    const ownerRequest =
      await OwnerRequest.create({
        applicant: applicantId,
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        propertyName: propertyName.trim(),
        propertyType,
        propertyLocation:
          propertyLocation.trim(),
        message: message?.trim() || "",
      });

    return res.status(201).json({
      success: true,
      message:
        "Owner request submitted successfully. The administration team will review it.",
      request: ownerRequest,
    });
  } catch (error) {
    console.error(
      "Create owner request error:",
      error
    );

    if (error.name === "ValidationError") {
      const firstError = Object.values(
        error.errors
      )[0];

      return res.status(400).json({
        success: false,
        message:
          firstError?.message ||
          "Invalid request information.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to submit the owner request.",
    });
  }
};

/* ==========================================
   GET CURRENT USER REQUESTS
   GET /api/owner-requests/my-requests
   Access: Authenticated user
========================================== */

export const getMyOwnerRequests = async (
  req,
  res
) => {
  try {
    const applicantId =
      getAuthenticatedUserId(req);

    const requests = await OwnerRequest.find({
      applicant: applicantId,
    })
      .populate(
        "reviewedBy",
        "fullName email role"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error(
      "Get my owner requests error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load your owner requests.",
    });
  }
};

/* ==========================================
   GET ALL OWNER REQUESTS
   GET /api/owner-requests
   Access: Admin and Super Admin
========================================== */

export const getOwnerRequests = async (
  req,
  res
) => {
  try {
    const {
      status,
      propertyType,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (
      status &&
      ["pending", "approved", "rejected"].includes(
        status
      )
    ) {
      query.status = status;
    }

    if (
      propertyType &&
      [
        "homestay",
        "hotel",
        "resort",
        "guest-house",
      ].includes(propertyType)
    ) {
      query.propertyType = propertyType;
    }

    if (search?.trim()) {
      const searchRegex = new RegExp(
        search.trim(),
        "i"
      );

      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { propertyName: searchRegex },
        { propertyLocation: searchRegex },
      ];
    }

    const pageNumber = Math.max(
      Number.parseInt(page, 10) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(
        Number.parseInt(limit, 10) || 20,
        1
      ),
      100
    );

    const skip =
      (pageNumber - 1) * limitNumber;

    const [requests, total] =
      await Promise.all([
        OwnerRequest.find(query)
          .populate(
            "applicant",
            "fullName email phone role"
          )
          .populate(
            "reviewedBy",
            "fullName email role"
          )
          .sort({
            status: 1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limitNumber),

        OwnerRequest.countDocuments(query),
      ]);

    return res.status(200).json({
      success: true,
      count: requests.length,
      total,
      currentPage: pageNumber,
      totalPages: Math.ceil(
        total / limitNumber
      ),
      requests,
    });
  } catch (error) {
    console.error(
      "Get owner requests error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load owner requests.",
    });
  }
};

/* ==========================================
   GET ONE OWNER REQUEST
   GET /api/owner-requests/:id
   Access: Admin and Super Admin
========================================== */

export const getOwnerRequestById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner request ID.",
      });
    }

    const ownerRequest =
      await OwnerRequest.findById(id)
        .populate(
          "applicant",
          "fullName email phone role"
        )
        .populate(
          "reviewedBy",
          "fullName email role"
        );

    if (!ownerRequest) {
      return res.status(404).json({
        success: false,
        message: "Owner request not found.",
      });
    }

    return res.status(200).json({
      success: true,
      request: ownerRequest,
    });
  } catch (error) {
    console.error(
      "Get owner request error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load the owner request.",
    });
  }
};

/* ==========================================
   REVIEW OWNER REQUEST
   PATCH /api/owner-requests/:id/review
   Access: Admin and Super Admin
========================================== */

export const reviewOwnerRequest = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { status, adminNote = "" } =
      req.body;

    const reviewerId =
      getAuthenticatedUserId(req);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner request ID.",
      });
    }

    if (
      !["approved", "rejected"].includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Status must be approved or rejected.",
      });
    }

    if (
      typeof adminNote !== "string" ||
      adminNote.length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The administrative note cannot exceed 1000 characters.",
      });
    }

    const ownerRequest =
      await OwnerRequest.findById(id);

    if (!ownerRequest) {
      return res.status(404).json({
        success: false,
        message: "Owner request not found.",
      });
    }

    if (ownerRequest.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: `This request has already been ${ownerRequest.status}.`,
      });
    }

    const applicant = await User.findById(
      ownerRequest.applicant
    );

    if (!applicant) {
      return res.status(404).json({
        success: false,
        message:
          "The applicant account no longer exists.",
      });
    }

    ownerRequest.status = status;
    ownerRequest.adminNote =
      adminNote.trim();
    ownerRequest.reviewedBy = reviewerId;
    ownerRequest.reviewedAt = new Date();

    if (status === "approved") {
      applicant.role = "owner";

      await applicant.save();
    }

    await ownerRequest.save();

    const populatedRequest =
      await OwnerRequest.findById(
        ownerRequest._id
      )
        .populate(
          "applicant",
          "fullName email phone role"
        )
        .populate(
          "reviewedBy",
          "fullName email role"
        );

    return res.status(200).json({
      success: true,
      message:
        status === "approved"
          ? "Owner request approved. The user now has owner access."
          : "Owner request rejected.",
      request: populatedRequest,
    });
  } catch (error) {
    console.error(
      "Review owner request error:",
      error
    );

    if (error.name === "ValidationError") {
      const firstError = Object.values(
        error.errors
      )[0];

      return res.status(400).json({
        success: false,
        message:
          firstError?.message ||
          "Invalid review information.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to review the owner request.",
    });
  }
};