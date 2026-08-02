import mongoose from "mongoose";

import Property from "../models/Property.js";

import SavedProperty from "../models/SavedProperty.js";

/* =====================================
   Helpers
===================================== */

const getUserId = (req) => {
  return (
    req.user?._id ||
    req.user?.id ||
    null
  );
};

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(
    value
  );
};

const escapeRegex = (
  value = ""
) => {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

const populateSavedProperty = (
  query
) => {
  return query.populate({
    path: "property",

    select:
      "title description propertyType location pricePerNight originalPrice maxGuests bedrooms bathrooms totalRooms availableRooms amenities images rating totalReviews owner isFeatured isActive approvalStatus createdAt",

    populate: {
      path: "owner",

      select:
        "fullName email",
    },
  });
};

const findPublicProperty = async (
  propertyId
) => {
  return Property.findOne({
    _id: propertyId,

    approvalStatus:
      "approved",

    isActive: true,
  });
};

const createSavedProperty = async (
  userId,
  propertyId
) => {
  try {
    return await SavedProperty.create(
      {
        user: userId,

        property:
          propertyId,
      }
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    return SavedProperty.findOne(
      {
        user: userId,

        property:
          propertyId,
      }
    );
  }
};

/* =====================================
   Get logged-in user's saved properties

   GET /api/saved-properties
===================================== */

export const getMySavedProperties =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Authentication required. Please login.",
          });
      }

      const {
        search = "",
        propertyType = "all",
        sort = "newest",
        page = 1,
        limit = 12,
      } = req.query;

      const propertyFilter = {
        approvalStatus:
          "approved",

        isActive: true,
      };

      if (search.trim()) {
        const searchExpression =
          new RegExp(
            escapeRegex(
              search.trim()
            ),
            "i"
          );

        propertyFilter.$or = [
          {
            title:
              searchExpression,
          },

          {
            description:
              searchExpression,
          },

          {
            "location.address":
              searchExpression,
          },

          {
            "location.city":
              searchExpression,
          },

          {
            "location.district":
              searchExpression,
          },
        ];
      }

      if (
        propertyType &&
        propertyType !== "all"
      ) {
        propertyFilter.propertyType =
          propertyType;
      }

      const matchingPropertyIds =
        await Property.distinct(
          "_id",
          propertyFilter
        );

      const savedPropertyFilter =
        {
          user: userId,

          property: {
            $in:
              matchingPropertyIds,
          },
        };

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const pageSize =
        Math.min(
          Math.max(
            Number(limit) || 12,
            1
          ),
          50
        );

      const sortOptions = {
        newest: {
          createdAt: -1,
        },

        oldest: {
          createdAt: 1,
        },
      };

      const selectedSort =
        sortOptions[sort] ||
        sortOptions.newest;

      const [
        savedProperties,
        totalSavedProperties,
        allSavedCount,
      ] = await Promise.all([
        populateSavedProperty(
          SavedProperty.find(
            savedPropertyFilter
          )
            .sort(selectedSort)
            .skip(
              (currentPage - 1) *
                pageSize
            )
            .limit(pageSize)
        ),

        SavedProperty.countDocuments(
          savedPropertyFilter
        ),

        SavedProperty.countDocuments(
          {
            user: userId,
          }
        ),
      ]);

      const validSavedProperties =
        savedProperties.filter(
          (savedProperty) => {
            return Boolean(
              savedProperty.property
            );
          }
        );

      const properties =
        validSavedProperties.map(
          (savedProperty) => {
            return {
              ...savedProperty.property.toObject(),

              savedPropertyId:
                savedProperty._id,

              savedAt:
                savedProperty.createdAt,

              isSaved: true,
            };
          }
        );

      const totalPages =
        Math.ceil(
          totalSavedProperties /
            pageSize
        );

      return res
        .status(200)
        .json({
          success: true,

          count:
            properties.length,

          savedProperties:
            validSavedProperties,

          properties,

          statistics: {
            totalSaved:
              allSavedCount,

            matchingSaved:
              totalSavedProperties,
          },

          pagination: {
            currentPage,

            totalPages,

            totalSavedProperties,

            pageSize,

            hasNextPage:
              currentPage <
              totalPages,

            hasPreviousPage:
              currentPage > 1,
          },
        });
    } catch (error) {
      console.error(
        "Get saved properties error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load your saved properties.",
        });
    }
  };

/* =====================================
   Get saved property IDs

   GET /api/saved-properties/ids
===================================== */

export const getSavedPropertyIds =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Authentication required. Please login.",
          });
      }

      const savedProperties =
        await SavedProperty.find(
          {
            user: userId,
          }
        )
          .select("property")
          .sort({
            createdAt: -1,
          })
          .lean();

      const propertyIds =
        savedProperties
          .map(
            (
              savedProperty
            ) => {
              return savedProperty
                .property
                ?.toString();
            }
          )
          .filter(Boolean);

      return res
        .status(200)
        .json({
          success: true,

          count:
            propertyIds.length,

          propertyIds,
        });
    } catch (error) {
      console.error(
        "Get saved property IDs error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load saved-property IDs.",
        });
    }
  };

/* =====================================
   Check whether property is saved

   GET /api/saved-properties/:propertyId/check
===================================== */

export const checkSavedProperty =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      const {
        propertyId,
      } = req.params;

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Authentication required. Please login.",
          });
      }

      if (
        !isValidObjectId(
          propertyId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid property ID.",
          });
      }

      const savedProperty =
        await SavedProperty.findOne(
          {
            user: userId,

            property:
              propertyId,
          }
        ).select(
          "_id property createdAt"
        );

      return res
        .status(200)
        .json({
          success: true,

          isSaved:
            Boolean(
              savedProperty
            ),

          savedPropertyId:
            savedProperty?._id ||
            null,
        });
    } catch (error) {
      console.error(
        "Check saved property error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to check the saved-property status.",
        });
    }
  };

/* =====================================
   Save property

   POST /api/saved-properties/:propertyId
===================================== */

export const saveProperty =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      const {
        propertyId,
      } = req.params;

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Authentication required. Please login.",
          });
      }

      if (
        !isValidObjectId(
          propertyId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid property ID.",
          });
      }

      const property =
        await findPublicProperty(
          propertyId
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property was not found or is not available publicly.",
          });
      }

      const existingSavedProperty =
        await SavedProperty.findOne(
          {
            user: userId,

            property:
              propertyId,
          }
        );

      if (
        existingSavedProperty
      ) {
        const populatedSavedProperty =
          await populateSavedProperty(
            SavedProperty.findById(
              existingSavedProperty._id
            )
          );

        return res
          .status(200)
          .json({
            success: true,

            message:
              "Property is already saved.",

            isSaved: true,

            savedProperty:
              populatedSavedProperty,
          });
      }

      const savedProperty =
        await createSavedProperty(
          userId,
          propertyId
        );

      if (!savedProperty) {
        throw new Error(
          "Unable to create the saved-property record."
        );
      }

      const populatedSavedProperty =
        await populateSavedProperty(
          SavedProperty.findById(
            savedProperty._id
          )
        );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Property saved successfully.",

          isSaved: true,

          savedProperty:
            populatedSavedProperty,
        });
    } catch (error) {
      console.error(
        "Save property error:",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        const validationMessage =
          Object.values(
            error.errors || {}
          )[0]?.message;

        return res
          .status(400)
          .json({
            success: false,

            message:
              validationMessage ||
              "Invalid saved-property information.",
          });
      }

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to save this property.",
        });
    }
  };

/* =====================================
   Toggle saved property

   PATCH /api/saved-properties/:propertyId/toggle
===================================== */

export const toggleSavedProperty =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      const {
        propertyId,
      } = req.params;

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Authentication required. Please login.",
          });
      }

      if (
        !isValidObjectId(
          propertyId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid property ID.",
          });
      }

      const existingSavedProperty =
        await SavedProperty.findOne(
          {
            user: userId,

            property:
              propertyId,
          }
        );

      if (
        existingSavedProperty
      ) {
        await existingSavedProperty.deleteOne();

        return res
          .status(200)
          .json({
            success: true,

            message:
              "Property removed from your saved list.",

            isSaved: false,
          });
      }

      const property =
        await findPublicProperty(
          propertyId
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property was not found or is not available publicly.",
          });
      }

      const savedProperty =
        await createSavedProperty(
          userId,
          propertyId
        );

      if (!savedProperty) {
        throw new Error(
          "Unable to create the saved-property record."
        );
      }

      const populatedSavedProperty =
        await populateSavedProperty(
          SavedProperty.findById(
            savedProperty._id
          )
        );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Property saved successfully.",

          isSaved: true,

          savedProperty:
            populatedSavedProperty,
        });
    } catch (error) {
      console.error(
        "Toggle saved property error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to update this saved property.",
        });
    }
  };

/* =====================================
   Remove saved property

   DELETE /api/saved-properties/:propertyId
===================================== */

export const removeSavedProperty =
  async (req, res) => {
    try {
      const userId =
        getUserId(req);

      const {
        propertyId,
      } = req.params;

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Authentication required. Please login.",
          });
      }

      if (
        !isValidObjectId(
          propertyId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid property ID.",
          });
      }

      const savedProperty =
        await SavedProperty.findOneAndDelete(
          {
            user: userId,

            property:
              propertyId,
          }
        );

      if (!savedProperty) {
        return res
          .status(200)
          .json({
            success: true,

            message:
              "Property was not in your saved list.",

            isSaved: false,
          });
      }

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Property removed from your saved list.",

          isSaved: false,
        });
    } catch (error) {
      console.error(
        "Remove saved property error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to remove this saved property.",
        });
    }
  };