import mongoose from "mongoose";

import ContactEnquiry from "../models/ContactEnquiry.js";

const ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "in_progress",
  "resolved",
  "closed",
];

const cleanValue = (value) => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const getRequestIp = (req) => {
  const forwardedIp =
    req.headers["x-forwarded-for"];

  if (typeof forwardedIp === "string") {
    return (
      forwardedIp
        .split(",")[0]
        ?.trim() || ""
    );
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    ""
  );
};

const escapeRegularExpression = (
  value
) => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/* =====================================
   Create public enquiry
===================================== */

export const createContactEnquiry =
  async (req, res) => {
    try {
      const name =
        cleanValue(req.body.name);

      const email =
        cleanValue(
          req.body.email
        ).toLowerCase();

      const phone =
        cleanValue(req.body.phone);

      const message =
        cleanValue(req.body.message);

      if (
        !name ||
        !email ||
        !phone ||
        !message
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Name, email, phone number and message are required.",
        });
      }

      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid email address.",
        });
      }

      const phoneDigits =
        phone.replace(/\D/g, "");

      if (
        phoneDigits.length < 10 ||
        phoneDigits.length > 15
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid phone number.",
        });
      }

      if (name.length < 2) {
        return res.status(400).json({
          success: false,
          message:
            "Name must contain at least 2 characters.",
        });
      }

      if (message.length < 10) {
        return res.status(400).json({
          success: false,
          message:
            "Message must contain at least 10 characters.",
        });
      }

      const enquiry =
        await ContactEnquiry.create({
          name,
          email,
          phone,
          message,
          source: "website",
          ipAddress:
            getRequestIp(req),
          userAgent:
            cleanValue(
              req.headers[
                "user-agent"
              ]
            ).slice(0, 500),
        });

      return res.status(201).json({
        success: true,
        message:
          "Thank you! Your enquiry has been submitted successfully. Our team will contact you shortly.",
        enquiry: {
          id: enquiry._id,
          enquiryReference:
            enquiry.enquiryReference,
          name: enquiry.name,
          email: enquiry.email,
          phone: enquiry.phone,
          status: enquiry.status,
          createdAt:
            enquiry.createdAt,
        },
      });
    } catch (error) {
      console.error(
        "Create contact enquiry error:",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        const message =
          Object.values(
            error.errors
          )
            .map(
              (item) =>
                item.message
            )
            .join(" ");

        return res.status(400).json({
          success: false,
          message:
            message ||
            "Enquiry validation failed.",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Unable to submit your enquiry. Please try again.",
      });
    }
  };

/* =====================================
   Get all enquiries for Super Admin
===================================== */

export const getContactEnquiries =
  async (req, res) => {
    try {
      const page = Math.max(
        Number.parseInt(
          req.query.page,
          10
        ) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number.parseInt(
            req.query.limit,
            10
          ) || 20,
          1
        ),
        100
      );

      const skip =
        (page - 1) * limit;

      const status =
        cleanValue(
          req.query.status
        );

      const search =
        cleanValue(
          req.query.search
        );

      const filter = {};

      if (
        status &&
        status !== "all"
      ) {
        if (
          !ENQUIRY_STATUSES.includes(
            status
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid enquiry status.",
          });
        }

        filter.status = status;
      }

      if (search) {
        const safeSearch =
          escapeRegularExpression(
            search
          );

        filter.$or = [
          {
            enquiryReference: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            name: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            email: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            phone: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            message: {
              $regex: safeSearch,
              $options: "i",
            },
          },
        ];
      }

      const [
        enquiries,
        totalEnquiries,
        statusSummary,
      ] = await Promise.all([
        ContactEnquiry.find(filter)
          .populate({
            path: "assignedTo",
            select:
              "fullName email role",
          })
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit),

        ContactEnquiry.countDocuments(
          filter
        ),

        ContactEnquiry.aggregate([
          {
            $group: {
              _id: "$status",
              count: {
                $sum: 1,
              },
            },
          },
        ]),
      ]);

      const statistics = {
        total: 0,
        new: 0,
        contacted: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
      };

      statusSummary.forEach(
        (item) => {
          statistics[
            item._id
          ] = item.count;

          statistics.total +=
            item.count;
        }
      );

      return res.status(200).json({
        success: true,
        count: enquiries.length,
        totalEnquiries,
        currentPage: page,
        totalPages: Math.max(
          Math.ceil(
            totalEnquiries / limit
          ),
          1
        ),
        statistics,
        enquiries,
      });
    } catch (error) {
      console.error(
        "Get contact enquiries error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load contact enquiries.",
      });
    }
  };

/* =====================================
   Get one enquiry
===================================== */

export const getContactEnquiryById =
  async (req, res) => {
    try {
      const { id } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid enquiry ID.",
        });
      }

      const enquiry =
        await ContactEnquiry.findById(
          id
        ).populate({
          path: "assignedTo",
          select:
            "fullName email role",
        });

      if (!enquiry) {
        return res.status(404).json({
          success: false,
          message:
            "Enquiry not found.",
        });
      }

      return res.status(200).json({
        success: true,
        enquiry,
      });
    } catch (error) {
      console.error(
        "Get contact enquiry error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load the enquiry.",
      });
    }
  };

/* =====================================
   Update enquiry
===================================== */

export const updateContactEnquiry =
  async (req, res) => {
    try {
      const { id } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid enquiry ID.",
        });
      }

      const enquiry =
        await ContactEnquiry.findById(
          id
        );

      if (!enquiry) {
        return res.status(404).json({
          success: false,
          message:
            "Enquiry not found.",
        });
      }

      const {
        status,
        adminNote,
        assignedTo,
      } = req.body;

      if (status !== undefined) {
        if (
          !ENQUIRY_STATUSES.includes(
            status
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid enquiry status.",
          });
        }

        enquiry.status = status;

        if (status === "contacted") {
          enquiry.contactedAt =
            enquiry.contactedAt ||
            new Date();
        }

        if (status === "resolved") {
          enquiry.resolvedAt =
            new Date();
        } else {
          enquiry.resolvedAt =
            null;
        }
      }

      if (adminNote !== undefined) {
        const cleanedNote =
          cleanValue(adminNote);

        if (
          cleanedNote.length > 2000
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Admin note cannot exceed 2000 characters.",
          });
        }

        enquiry.adminNote =
          cleanedNote;
      }

      if (assignedTo !== undefined) {
        if (
          assignedTo &&
          !mongoose.Types.ObjectId.isValid(
            assignedTo
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid assigned staff ID.",
          });
        }

        enquiry.assignedTo =
          assignedTo || null;
      }

      await enquiry.save();

      await enquiry.populate({
        path: "assignedTo",
        select:
          "fullName email role",
      });

      return res.status(200).json({
        success: true,
        message:
          "Enquiry updated successfully.",
        enquiry,
      });
    } catch (error) {
      console.error(
        "Update contact enquiry error:",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Unable to update the enquiry.",
      });
    }
  };