import mongoose from "mongoose";

/* =====================================
   Enquiry-reference generator
===================================== */

const generateEnquiryReference = () => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  const randomValue =
    Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();

  return (
    `HHS-ENQ-${date}-${randomValue}`
  );
};

/* =====================================
   Contact-enquiry schema
===================================== */

const contactEnquirySchema =
  new mongoose.Schema(
    {
      enquiryReference: {
        type: String,
        unique: true,
        index: true,
        default:
          generateEnquiryReference,
      },

      name: {
        type: String,
        required: [
          true,
          "Name is required.",
        ],
        trim: true,
        minlength: [
          2,
          "Name must contain at least 2 characters.",
        ],
        maxlength: [
          100,
          "Name cannot exceed 100 characters.",
        ],
      },

      email: {
        type: String,
        required: [
          true,
          "Email is required.",
        ],
        trim: true,
        lowercase: true,
        maxlength: [
          150,
          "Email cannot exceed 150 characters.",
        ],
        match: [
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          "Please provide a valid email address.",
        ],
        index: true,
      },

      phone: {
        type: String,
        required: [
          true,
          "Phone number is required.",
        ],
        trim: true,
        maxlength: [
          20,
          "Phone number cannot exceed 20 characters.",
        ],
      },

      message: {
        type: String,
        required: [
          true,
          "Message is required.",
        ],
        trim: true,
        minlength: [
          10,
          "Message must contain at least 10 characters.",
        ],
        maxlength: [
          3000,
          "Message cannot exceed 3000 characters.",
        ],
      },

      status: {
        type: String,
        enum: [
          "new",
          "contacted",
          "in_progress",
          "resolved",
          "closed",
        ],
        default: "new",
        index: true,
      },

      source: {
        type: String,
        enum: [
          "website",
          "admin",
          "other",
        ],
        default: "website",
      },

      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
      },

      adminNote: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: "",
      },

      contactedAt: {
        type: Date,
        default: null,
      },

      resolvedAt: {
        type: Date,
        default: null,
      },

      ipAddress: {
        type: String,
        trim: true,
        default: "",
        select: false,
      },

      userAgent: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
        select: false,
      },
    },
    {
      timestamps: true,
    }
  );

/* =====================================
   Database indexes
===================================== */

contactEnquirySchema.index({
  status: 1,
  createdAt: -1,
});

contactEnquirySchema.index({
  email: 1,
  createdAt: -1,
});

const ContactEnquiry =
  mongoose.model(
    "ContactEnquiry",
    contactEnquirySchema
  );

export default ContactEnquiry;