import mongoose from "mongoose";

const savedPropertySchema =
  new mongoose.Schema(
    {
      user: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",

        required: [
          true,
          "User is required.",
        ],

        index: true,
      },

      property: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Property",

        required: [
          true,
          "Property is required.",
        ],

        index: true,
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

/* =====================================
   Prevent duplicate saved properties

   One user can save a property only once.
===================================== */

savedPropertySchema.index(
  {
    user: 1,
    property: 1,
  },
  {
    unique: true,
    name: "unique_user_saved_property",
  }
);

/* =====================================
   Customer saved-property listing
===================================== */

savedPropertySchema.index(
  {
    user: 1,
    createdAt: -1,
  },
  {
    name: "saved_properties_by_user",
  }
);

/* =====================================
   Property save count
===================================== */

savedPropertySchema.index(
  {
    property: 1,
    createdAt: -1,
  },
  {
    name: "saved_property_popularity",
  }
);

const SavedProperty =
  mongoose.model(
    "SavedProperty",
    savedPropertySchema
  );

export default SavedProperty;