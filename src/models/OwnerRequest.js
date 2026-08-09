import mongoose from "mongoose";

const ownerRequestSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fullName: {
      type: String,
      required: [true, "Full name is required."],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, "Email address is required."],
      trim: true,
      lowercase: true,
      maxlength: 150,
    },

    phone: {
      type: String,
      required: [true, "Phone number is required."],
      trim: true,
      match: [
        /^[6-9]\d{9}$/,
        "Please provide a valid 10-digit mobile number.",
      ],
    },

    propertyName: {
      type: String,
      required: [true, "Property name is required."],
      trim: true,
      maxlength: 180,
    },

    propertyType: {
      type: String,
      required: [true, "Property type is required."],
      enum: [
        "homestay",
        "hotel",
        "resort",
        "guest-house",
      ],
    },

    propertyLocation: {
      type: String,
      required: [true, "Property location is required."],
      trim: true,
      maxlength: 500,
    },

    message: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    adminNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ownerRequestSchema.index({
  applicant: 1,
  status: 1,
});

const OwnerRequest = mongoose.model(
  "OwnerRequest",
  ownerRequestSchema
);

export default OwnerRequest;