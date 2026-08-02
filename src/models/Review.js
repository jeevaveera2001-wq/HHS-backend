import mongoose from "mongoose";

const ownerReplySchema =
  new mongoose.Schema(
    {
      message: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: "",
      },

      repliedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",
        default: null,
      },

      repliedAt: {
        type: Date,
        default: null,
      },
    },
    {
      _id: false,
    }
  );

const reviewSchema =
  new mongoose.Schema(
    {
      customer: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",
        required: true,
        index: true,
      },

      property: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Property",
        required: true,
        index: true,
      },

      booking: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Booking",
        required: true,
        unique: true,
        index: true,
      },

      rating: {
        type: Number,

        required: [
          true,
          "Rating is required.",
        ],

        min: [
          1,
          "Rating must be at least 1.",
        ],

        max: [
          5,
          "Rating cannot exceed 5.",
        ],
      },

      title: {
        type: String,
        trim: true,
        maxlength: 120,
        default: "",
      },

      comment: {
        type: String,

        required: [
          true,
          "Review comment is required.",
        ],

        trim: true,

        minlength: [
          10,
          "Review must contain at least 10 characters.",
        ],

        maxlength: [
          2000,
          "Review cannot exceed 2000 characters.",
        ],
      },

      isVerifiedStay: {
        type: Boolean,
        default: true,
        immutable: true,
      },

      isVisible: {
        type: Boolean,
        default: true,
        index: true,
      },

      moderationNote: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },

      moderatedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",
        default: null,
      },

      moderatedAt: {
        type: Date,
        default: null,
      },

      ownerReply: {
        type: ownerReplySchema,
        default: () => ({}),
      },
    },
    {
      timestamps: true,
    }
  );

reviewSchema.index({
  property: 1,
  isVisible: 1,
  createdAt: -1,
});

reviewSchema.index({
  customer: 1,
  createdAt: -1,
});

const Review = mongoose.model(
  "Review",
  reviewSchema
);

export default Review;