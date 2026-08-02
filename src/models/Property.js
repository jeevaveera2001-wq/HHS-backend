import mongoose from "mongoose";

/* =====================================================
   Approval history schema
===================================================== */

const approvalHistorySchema =
  new mongoose.Schema(
    {
      status: {
        type: String,

        enum: [
          "pending",
          "approved",
          "rejected",
        ],

        required: true,
      },

      note: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },

      reviewedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        default: null,
      },

      reviewedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      _id: true,
    }
  );

/* =====================================================
   Property image schema
===================================================== */

const propertyImageSchema =
  new mongoose.Schema(
    {
      url: {
        type: String,
        required: true,
        trim: true,
      },

      publicId: {
        type: String,
        trim: true,
        default: "",
      },

      isCover: {
        type: Boolean,
        default: false,
      },
    },
    {
      _id: true,
    }
  );

/* =====================================================
   Property schema
===================================================== */

const propertySchema =
  new mongoose.Schema(
    {
      title: {
        type: String,

        required: [
          true,
          "Property title is required",
        ],

        trim: true,

        minlength: [
          3,
          "Property title must contain at least 3 characters",
        ],

        maxlength: [
          120,
          "Property title cannot exceed 120 characters",
        ],
      },

      description: {
        type: String,

        required: [
          true,
          "Property description is required",
        ],

        trim: true,

        minlength: [
          20,
          "Property description must contain at least 20 characters",
        ],

        maxlength: [
          3000,
          "Property description cannot exceed 3000 characters",
        ],
      },

      propertyType: {
        type: String,

        required: [
          true,
          "Property type is required",
        ],

        enum: [
          "Homestay",
          "Hotel",
          "Resort",
          "Villa",
          "Cottage",
          "Guest House",
        ],
      },

      location: {
        address: {
          type: String,

          required: [
            true,
            "Property address is required",
          ],

          trim: true,
        },

        city: {
          type: String,
          default: "Hogenakkal",
          trim: true,
        },

        district: {
          type: String,
          default: "Dharmapuri",
          trim: true,
        },

        state: {
          type: String,
          default: "Tamil Nadu",
          trim: true,
        },

        pincode: {
          type: String,
          trim: true,
          default: "",
        },

        coordinates: {
          latitude: {
            type: Number,
            default: null,
          },

          longitude: {
            type: Number,
            default: null,
          },
        },
      },

      pricePerNight: {
        type: Number,

        required: [
          true,
          "Price per night is required",
        ],

        min: [
          0,
          "Price cannot be negative",
        ],
      },

      originalPrice: {
        type: Number,

        min: [
          0,
          "Original price cannot be negative",
        ],

        default: null,
      },

      maxGuests: {
        type: Number,

        required: [
          true,
          "Maximum guest count is required",
        ],

        min: [
          1,
          "Maximum guests must be at least 1",
        ],
      },

      bedrooms: {
        type: Number,

        required: [
          true,
          "Bedroom count is required",
        ],

        min: [
          1,
          "A property must have at least 1 bedroom",
        ],
      },

      bathrooms: {
        type: Number,

        required: [
          true,
          "Bathroom count is required",
        ],

        min: [
          1,
          "A property must have at least 1 bathroom",
        ],
      },

      totalRooms: {
        type: Number,

        required: [
          true,
          "Total room count is required",
        ],

        min: [
          1,
          "A property must have at least 1 room",
        ],
      },

      availableRooms: {
        type: Number,

        required: [
          true,
          "Available room count is required",
        ],

        min: [
          0,
          "Available rooms cannot be negative",
        ],

        validate: {
          validator(value) {
            if (
              this.totalRooms ===
                undefined ||
              this.totalRooms === null
            ) {
              return true;
            }

            return (
              value <=
              this.totalRooms
            );
          },

          message:
            "Available rooms cannot exceed total rooms",
        },
      },

      amenities: [
        {
          type: String,
          trim: true,
        },
      ],

      images: {
        type: [
          propertyImageSchema,
        ],

        default: [],
      },

      rules: [
        {
          type: String,
          trim: true,
        },
      ],

      checkInTime: {
        type: String,
        trim: true,
        default: "12:00 PM",
      },

      checkOutTime: {
        type: String,
        trim: true,
        default: "11:00 AM",
      },

      rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },

      totalReviews: {
        type: Number,
        default: 0,
        min: 0,
      },

      owner: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        required: [
          true,
          "Property owner is required",
        ],

        index: true,
      },

      isFeatured: {
        type: Boolean,
        default: false,
      },

      isActive: {
        type: Boolean,
        default: true,
      },

      /* ================================================
         Property approval lifecycle
      ================================================= */

      approvalStatus: {
        type: String,

        enum: [
          "pending",
          "approved",
          "rejected",
        ],

        default: "pending",

        required: true,
      },

      submittedAt: {
        type: Date,
        default: Date.now,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      reviewedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        default: null,
      },

      rejectionReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },

      approvalNote: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },

      approvalHistory: {
        type: [
          approvalHistorySchema,
        ],

        default: [],
      },
    },
    {
      timestamps: true,

      toJSON: {
        virtuals: true,
      },

      toObject: {
        virtuals: true,
      },
    }
  );

/* =====================================================
   Property approval validation

   IMPORTANT:
   A normal function is required here because Mongoose
   assigns the current property document to `this`.
   Do not convert this into an arrow function.
===================================================== */

propertySchema.pre(
  "validate",
  function validatePropertyApproval() {
    if (
      this.approvalStatus ===
        "rejected" &&
      !this.rejectionReason?.trim()
    ) {
      this.invalidate(
        "rejectionReason",
        "Rejection reason is required when a property is rejected"
      );
    }

    if (
      this.approvalStatus ===
      "approved"
    ) {
      this.rejectionReason =
        "";
    }

    if (
      this.originalPrice !==
        null &&
      this.originalPrice !==
        undefined &&
      this.pricePerNight !==
        null &&
      this.pricePerNight !==
        undefined &&
      this.originalPrice <
        this.pricePerNight
    ) {
      this.invalidate(
        "originalPrice",
        "Original price cannot be lower than the current price"
      );
    }

    if (
      this.isFeatured &&
      this.approvalStatus !==
        "approved"
    ) {
      this.invalidate(
        "isFeatured",
        "Only approved properties can be featured"
      );
    }
  }
);

/* =====================================================
   Search indexes
===================================================== */

propertySchema.index({
  title: "text",
  description: "text",
  "location.city": "text",
  "location.district": "text",
});

/* =====================================================
   Public property listing index
===================================================== */

propertySchema.index({
  approvalStatus: 1,
  isActive: 1,
  isFeatured: -1,
  createdAt: -1,
});

/* =====================================================
   Admin approval queue index
===================================================== */

propertySchema.index({
  approvalStatus: 1,
  submittedAt: -1,
});

/* =====================================================
   Owner property dashboard index
===================================================== */

propertySchema.index({
  owner: 1,
  approvalStatus: 1,
  createdAt: -1,
});

/* =====================================================
   Price and property type filter index
===================================================== */

propertySchema.index({
  pricePerNight: 1,
  propertyType: 1,
});

/* =====================================================
   Property model
===================================================== */

const Property =
  mongoose.models.Property ||
  mongoose.model(
    "Property",
    propertySchema
  );

export default Property;