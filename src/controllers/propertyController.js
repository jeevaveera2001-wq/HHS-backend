import mongoose from "mongoose";
import Property from "../models/Property.js";

/* =====================================================
   Helpers
===================================================== */

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id;
};

const normalizeStringArray = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeBoolean = (
  value,
  defaultValue = false
) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return defaultValue;
};

const sanitizeImages = (images) => {
  if (!Array.isArray(images)) {
    return [];
  }

  const filteredImages = images
    .filter((image) => image?.url)
    .map((image) => ({
      url: String(image.url).trim(),

      publicId: image.publicId
        ? String(image.publicId).trim()
        : "",

      isCover: Boolean(image.isCover),
    }));

  if (filteredImages.length === 0) {
    return [];
  }

  const coverImageIndex = filteredImages.findIndex(
    (image) => image.isCover
  );

  return filteredImages.map((image, index) => ({
    ...image,

    isCover:
      coverImageIndex === -1
        ? index === 0
        : index === coverImageIndex,
  }));
};

const parseLocation = (location = {}) => {
  return {
    address: location.address?.trim() || "",

    city:
      location.city?.trim() ||
      "Hogenakkal",

    district:
      location.district?.trim() ||
      "Dharmapuri",

    state:
      location.state?.trim() ||
      "Tamil Nadu",

    pincode: location.pincode?.trim() || "",

    coordinates: {
      latitude:
        location.coordinates?.latitude !==
          undefined &&
        location.coordinates?.latitude !== ""
          ? Number(
              location.coordinates.latitude
            )
          : undefined,

      longitude:
        location.coordinates?.longitude !==
          undefined &&
        location.coordinates?.longitude !== ""
          ? Number(
              location.coordinates.longitude
            )
          : undefined,
    },
  };
};

const canManageProperty = (
  property,
  user
) => {
  if (!property || !user) {
    return false;
  }

  if (
    user.role === "admin" ||
    user.role === "super_admin"
  ) {
    return true;
  }

  const userId = user._id || user.id;

  const ownerId =
    property.owner?._id ||
    property.owner;

  if (!userId || !ownerId) {
    return false;
  }

  return (
    ownerId.toString() ===
    userId.toString()
  );
};

/* =====================================================
   Create property
   POST /api/properties
   Owner/Admin
===================================================== */

export const createProperty = async (
  req,
  res
) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const {
      title,
      description,
      propertyType,
      location,
      pricePerNight,
      originalPrice,
      maxGuests,
      bedrooms,
      bathrooms,
      totalRooms,
      availableRooms,
      amenities,
      images,
      rules,
      checkInTime,
      checkOutTime,
    } = req.body;


   const uploadedImages = (req.files || []).map((file, index) => ({
  url: `/uploads/properties/${file.filename}`,
  isCover: index === 0,
}));

let modifylocation = typeof location === "string"
  ? JSON.parse(location)
  : location;
   console.log("+++++++++++++++Uploaded images:", uploadedImages);
   console.log("++++++++++++++Form data:", req.body,modifylocation);
    if (
      !title ||
      !description ||
      !propertyType ||
      !modifylocation?.address ||
      pricePerNight === undefined ||
      maxGuests === undefined ||
      bedrooms === undefined ||
      bathrooms === undefined ||
      totalRooms === undefined ||
      availableRooms === undefined
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Please provide all required property information.",
      });
    }

    const numericTotalRooms =
      Number(totalRooms);

    const numericAvailableRooms =
      Number(availableRooms);

    const numericPrice =
      Number(pricePerNight);

    if (
      Number.isNaN(numericTotalRooms) ||
      Number.isNaN(numericAvailableRooms) ||
      Number.isNaN(numericPrice)
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Price and room values must be valid numbers.",
      });
    }

    if (
      numericAvailableRooms >
      numericTotalRooms
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Available rooms cannot exceed total rooms.",
      });
    }

    if (
      originalPrice !== undefined &&
      originalPrice !== null &&
      originalPrice !== "" &&
      Number(originalPrice) < numericPrice
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Original price cannot be lower than the current price.",
      });
    }

    const property =
      await Property.create({
        title: title.trim(),

        description:
          description.trim(),

        propertyType,

        location:
          parseLocation(modifylocation),

        pricePerNight:
          numericPrice,

        originalPrice:
          originalPrice !== undefined &&
          originalPrice !== null &&
          originalPrice !== ""
            ? Number(originalPrice)
            : null,

        maxGuests:
          Number(maxGuests),

        bedrooms:
          Number(bedrooms),

        bathrooms:
          Number(bathrooms),

        totalRooms:
          numericTotalRooms,

        availableRooms:
          numericAvailableRooms,

        amenities:
          normalizeStringArray(
            amenities
          ),

        images:
          uploadedImages,

        rules:
          normalizeStringArray(rules),

        checkInTime:
          checkInTime ||
          "12:00 PM",

        checkOutTime:
          checkOutTime ||
          "11:00 AM",

        owner: userId,

        approvalStatus: "pending",

        submittedAt:
          new Date(),

        reviewedAt: null,

        reviewedBy: null,

        rejectionReason: "",

        approvalNote: "",

        approvalHistory: [
          {
            status: "pending",

            note:
              "Property submitted for approval.",

            reviewedBy: null,

            reviewedAt:
              new Date(),
          },
        ],
      });

    const populatedProperty =
      await Property.findById(
        property._id
      ).populate(
        "owner",
        "fullName email phone role"
      );

    return res.status(201).json({
      success: true,

      message:
        "Property submitted successfully and is waiting for admin approval.",

      property:
        populatedProperty,
    });
  } catch (error) {
    console.error(
      "Create property error:",
      error
    );

    if (
      error.name ===
      "ValidationError"
    ) {
      const validationErrors =
        Object.values(
          error.errors
        ).map(
          (item) =>
            item.message
        );

      return res.status(400).json({
        success: false,

        message:
          validationErrors[0],

        errors:
          validationErrors,
      });
    }

    return res.status(500).json({
      success: false,

      message:
        "Unable to create property.",

      error: error.message,
    });
  }
};

/* =====================================================
   Get public properties
   GET /api/properties
   Public
===================================================== */

export const getPublicProperties =
  async (req, res) => {
    try {
      const {
        search = "",
        propertyType = "",
        minPrice,
        maxPrice,
        guests,
        bedrooms,
        city = "",
        featured,
        sort = "newest",
        page = 1,
        limit = 12,
      } = req.query;

      const filter = {
        approvalStatus:
          "approved",

        isActive: true,

        availableRooms: {
          $gt: 0,
        },
      };

      if (
        String(search).trim()
      ) {
        filter.$or = [
          {
            title: {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            description: {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            "location.city": {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            "location.district":
              {
                $regex:
                  String(
                    search
                  ).trim(),

                $options: "i",
              },
          },
        ];
      }

      if (
        propertyType &&
        propertyType !== "all"
      ) {
        filter.propertyType =
          propertyType;
      }

      if (
        String(city).trim()
      ) {
        filter[
          "location.city"
        ] = {
          $regex:
            String(city).trim(),

          $options: "i",
        };
      }

      if (
        minPrice !==
          undefined ||
        maxPrice !==
          undefined
      ) {
        filter.pricePerNight =
          {};

        if (
          minPrice !==
            undefined &&
          minPrice !== ""
        ) {
          filter.pricePerNight.$gte =
            Number(minPrice);
        }

        if (
          maxPrice !==
            undefined &&
          maxPrice !== ""
        ) {
          filter.pricePerNight.$lte =
            Number(maxPrice);
        }
      }

      if (guests) {
        filter.maxGuests = {
          $gte:
            Number(guests),
        };
      }

      if (bedrooms) {
        filter.bedrooms = {
          $gte:
            Number(bedrooms),
        };
      }

      if (
        featured === "true"
      ) {
        filter.isFeatured =
          true;
      }

      const sortOptions = {
        newest: {
          isFeatured: -1,
          createdAt: -1,
        },

        oldest: {
          createdAt: 1,
        },

        priceLow: {
          pricePerNight: 1,
        },

        priceHigh: {
          pricePerNight: -1,
        },

        rating: {
          rating: -1,
          totalReviews: -1,
        },
      };

      const selectedSort =
        sortOptions[sort] ||
        sortOptions.newest;

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

      const skip =
        (currentPage - 1) *
        pageSize;

      const [
        properties,
        totalProperties,
      ] = await Promise.all([
        Property.find(filter)
          .populate(
            "owner",
            "fullName"
          )
          .sort(selectedSort)
          .skip(skip)
          .limit(pageSize),

        Property.countDocuments(
          filter
        ),
      ]);

      const totalPages =
        Math.ceil(
          totalProperties /
            pageSize
        );

      return res
        .status(200)
        .json({
          success: true,

          count:
            properties.length,

          properties,

          pagination: {
            currentPage,

            totalPages,

            totalProperties,

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
        "Get public properties error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load properties.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Get featured properties
   GET /api/properties/featured
   Public
===================================================== */

export const getFeaturedProperties =
  async (req, res) => {
    try {
      const limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit
            ) || 6,
            1
          ),
          20
        );

      const properties =
        await Property.find({
          approvalStatus:
            "approved",

          isActive: true,

          isFeatured: true,

          availableRooms: {
            $gt: 0,
          },
        })
          .populate(
            "owner",
            "fullName"
          )
          .sort({
            rating: -1,
            createdAt: -1,
          })
          .limit(limit);

      return res
        .status(200)
        .json({
          success: true,

          count:
            properties.length,

          properties,
        });
    } catch (error) {
      console.error(
        "Get featured properties error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load featured properties.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Get single public property
   GET /api/properties/:id
   Public
===================================================== */

export const getPublicPropertyById =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
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
        await Property.findOne(
          {
            _id: id,

            approvalStatus:
              "approved",

            isActive: true,
          }
        ).populate(
          "owner",
          "fullName"
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property was not found or is currently unavailable.",
          });
      }

      return res
        .status(200)
        .json({
          success: true,
          property,
        });
    } catch (error) {
      console.error(
        "Get public property error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load property.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Get current owner's properties
   GET /api/properties/owner/my-properties
   Owner
===================================================== */

export const getMyProperties =
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
              "Authentication required.",
          });
      }

      const {
        search = "",

        approvalStatus =
          "all",

        active = "all",

        page = 1,

        limit = 20,
      } = req.query;

      const filter = {
        owner: userId,
      };

      if (
        String(search).trim()
      ) {
        filter.$or = [
          {
            title: {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            "location.address":
              {
                $regex:
                  String(
                    search
                  ).trim(),

                $options: "i",
              },
          },

          {
            "location.city": {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },
        ];
      }

      if (
        approvalStatus &&
        approvalStatus !== "all"
      ) {
        filter.approvalStatus =
          approvalStatus;
      }

      if (
        active === "true"
      ) {
        filter.isActive =
          true;
      }

      if (
        active === "false"
      ) {
        filter.isActive =
          false;
      }

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const pageSize =
        Math.min(
          Math.max(
            Number(limit) || 20,
            1
          ),
          100
        );

      const skip =
        (currentPage - 1) *
        pageSize;

      const objectUserId =
        new mongoose.Types.ObjectId(
          userId
        );

      const [
        properties,

        totalProperties,

        statistics,
      ] = await Promise.all([
        Property.find(filter)
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(pageSize),

        Property.countDocuments(
          filter
        ),

        Property.aggregate([
          {
            $match: {
              owner:
                objectUserId,
            },
          },

          {
            $group: {
              _id:
                "$approvalStatus",

              count: {
                $sum: 1,
              },
            },
          },
        ]),
      ]);

      const stats = {
        total: 0,

        pending: 0,

        approved: 0,

        rejected: 0,
      };

      statistics.forEach(
        (item) => {
          if (
            Object.prototype.hasOwnProperty.call(
              stats,
              item._id
            )
          ) {
            stats[item._id] =
              item.count;
          }

          stats.total +=
            item.count;
        }
      );

      return res
        .status(200)
        .json({
          success: true,

          properties,

          statistics: stats,

          pagination: {
            currentPage,

            totalPages:
              Math.ceil(
                totalProperties /
                  pageSize
              ),

            totalProperties,

            pageSize,
          },
        });
    } catch (error) {
      console.error(
        "Get my properties error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load your properties.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Get property for owner/admin editing
   GET /api/properties/manage/:id
   Owner/Admin
===================================================== */

export const getManagedPropertyById =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
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
        await Property.findById(
          id
        )
          .populate(
            "owner",

            "fullName email phone role"
          )
          .populate(
            "reviewedBy",

            "fullName email role"
          )
          .populate(
            "approvalHistory.reviewedBy",

            "fullName email role"
          );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      if (
        !canManageProperty(
          property,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You do not have permission to access this property.",
          });
      }

      return res
        .status(200)
        .json({
          success: true,

          property,
        });
    } catch (error) {
      console.error(
        "Get managed property error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load property.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Update property
   PUT /api/properties/:id
   Owner/Admin
===================================================== */

export const updateProperty =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
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
        await Property.findById(
          id
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      if (
        !canManageProperty(
          property,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You do not have permission to update this property.",
          });
      }

      const isAdmin = [
        "admin",
        "super_admin",
      ].includes(req.user.role);

      const editableFields = [
        "title",
        "description",
        "propertyType",
        "pricePerNight",
        "originalPrice",
        "maxGuests",
        "bedrooms",
        "bathrooms",
        "totalRooms",
        "availableRooms",
        "checkInTime",
        "checkOutTime",
      ];

      editableFields.forEach(
        (field) => {
          if (
            req.body[field] !==
            undefined
          ) {
            property[field] =
              req.body[field];
          }
        }
      );

      if (
        req.body.location !==
        undefined
      ) {
        property.location =
          parseLocation(
            req.body.location
          );
      }

      if (
        req.body.amenities !==
        undefined
      ) {
        property.amenities =
          normalizeStringArray(
            req.body.amenities
          );
      }

      if (
        req.body.rules !==
        undefined
      ) {
        property.rules =
          normalizeStringArray(
            req.body.rules
          );
      }

      if (
        req.body.images !==
        undefined
      ) {
        property.images =
          sanitizeImages(
            req.body.images
          );
      }

      if (
        property.availableRooms >
        property.totalRooms
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Available rooms cannot exceed total rooms.",
          });
      }

      if (
        property.originalPrice !==
          null &&
        property.originalPrice !==
          undefined &&
        property.originalPrice <
          property.pricePerNight
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Original price cannot be lower than the current price.",
          });
      }

      if (isAdmin) {
        if (
          req.body.isFeatured !==
          undefined
        ) {
          const newFeaturedStatus =
            normalizeBoolean(
              req.body
                .isFeatured,

              property.isFeatured
            );

          if (
            newFeaturedStatus &&
            property.approvalStatus !==
              "approved"
          ) {
            return res
              .status(400)
              .json({
                success: false,

                message:
                  "Only approved properties can be featured.",
              });
          }

          property.isFeatured =
            newFeaturedStatus;
        }

        if (
          req.body.isActive !==
          undefined
        ) {
          property.isActive =
            normalizeBoolean(
              req.body.isActive,

              property.isActive
            );
        }
      } else if (
        property.approvalStatus ===
          "approved" ||
        property.approvalStatus ===
          "rejected"
      ) {
        property.approvalStatus =
          "pending";

        property.submittedAt =
          new Date();

        property.reviewedAt =
          null;

        property.reviewedBy =
          null;

        property.rejectionReason =
          "";

        property.approvalNote =
          "";

        property.isFeatured =
          false;

        property.approvalHistory.push(
          {
            status: "pending",

            note:
              "Property updated and resubmitted for approval.",

            reviewedBy:
              null,

            reviewedAt:
              new Date(),
          }
        );
      }

      await property.save();

      const updatedProperty =
        await Property.findById(
          property._id
        )
          .populate(
            "owner",

            "fullName email phone role"
          )
          .populate(
            "reviewedBy",

            "fullName email role"
          );

      return res
        .status(200)
        .json({
          success: true,

          message: isAdmin
            ? "Property updated successfully."
            : property.approvalStatus ===
                "pending"
              ? "Property updated and submitted for approval."
              : "Property updated successfully.",

          property:
            updatedProperty,
        });
    } catch (error) {
      console.error(
        "Update property error:",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        const validationErrors =
          Object.values(
            error.errors
          ).map(
            (item) =>
              item.message
          );

        return res
          .status(400)
          .json({
            success: false,

            message:
              validationErrors[0],

            errors:
              validationErrors,
          });
      }

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to update property.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Delete property
   DELETE /api/properties/:id
   Owner/Admin
===================================================== */

export const deleteProperty =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
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
        await Property.findById(
          id
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      if (
        !canManageProperty(
          property,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You do not have permission to delete this property.",
          });
      }

      await property.deleteOne();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Property deleted successfully.",
        });
    } catch (error) {
      console.error(
        "Delete property error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to delete property.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Toggle property active status
   PATCH /api/properties/:id/active
   Owner/Admin
===================================================== */

export const togglePropertyActiveStatus =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
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
        await Property.findById(
          id
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      if (
        !canManageProperty(
          property,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You do not have permission to update this property.",
          });
      }

      const requestedStatus =
        req.body.isActive !==
        undefined
          ? normalizeBoolean(
              req.body
                .isActive,

              property.isActive
            )
          : !property.isActive;

      property.isActive =
        requestedStatus;

      await property.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            requestedStatus
              ? "Property activated successfully."
              : "Property deactivated successfully.",

          property,
        });
    } catch (error) {
      console.error(
        "Toggle property status error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to change property availability.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Admin get all properties
   GET /api/properties/admin/all
   Admin
===================================================== */

export const getAllPropertiesForAdmin =
  async (req, res) => {
    try {
      const {
        search = "",

        approvalStatus =
          "all",

        propertyType =
          "all",

        active = "all",

        featured = "all",

        owner,

        page = 1,

        limit = 20,
      } = req.query;

      const filter = {};

      if (
        String(search).trim()
      ) {
        filter.$or = [
          {
            title: {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            description: {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            "location.address":
              {
                $regex:
                  String(
                    search
                  ).trim(),

                $options: "i",
              },
          },

          {
            "location.city": {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },
        ];
      }

      if (
        approvalStatus &&
        approvalStatus !== "all"
      ) {
        filter.approvalStatus =
          approvalStatus;
      }

      if (
        propertyType &&
        propertyType !== "all"
      ) {
        filter.propertyType =
          propertyType;
      }

      if (
        active === "true"
      ) {
        filter.isActive =
          true;
      }

      if (
        active === "false"
      ) {
        filter.isActive =
          false;
      }

      if (
        featured === "true"
      ) {
        filter.isFeatured =
          true;
      }

      if (
        featured === "false"
      ) {
        filter.isFeatured =
          false;
      }

      if (
        owner &&
        isValidObjectId(owner)
      ) {
        filter.owner = owner;
      }

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const pageSize =
        Math.min(
          Math.max(
            Number(limit) || 20,
            1
          ),
          100
        );

      const skip =
        (currentPage - 1) *
        pageSize;

      const [
        properties,

        totalProperties,

        statusCounts,

        activeCount,

        featuredCount,
      ] = await Promise.all([
        Property.find(filter)
          .populate(
            "owner",

            "fullName email phone role"
          )
          .populate(
            "reviewedBy",

            "fullName email role"
          )
          .sort({
            submittedAt: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(pageSize),

        Property.countDocuments(
          filter
        ),

        Property.aggregate([
          {
            $group: {
              _id:
                "$approvalStatus",

              count: {
                $sum: 1,
              },
            },
          },
        ]),

        Property.countDocuments({
          isActive: true,
        }),

        Property.countDocuments({
          isFeatured: true,
        }),
      ]);

      const statistics = {
        total: 0,

        pending: 0,

        approved: 0,

        rejected: 0,

        active: activeCount,

        featured:
          featuredCount,
      };

      statusCounts.forEach(
        (item) => {
          if (
            Object.prototype.hasOwnProperty.call(
              statistics,
              item._id
            )
          ) {
            statistics[item._id] =
              item.count;
          }

          statistics.total +=
            item.count;
        }
      );

      return res
        .status(200)
        .json({
          success: true,

          properties,

          statistics,

          pagination: {
            currentPage,

            totalPages:
              Math.ceil(
                totalProperties /
                  pageSize
              ),

            totalProperties,

            pageSize,
          },
        });
    } catch (error) {
      console.error(
        "Get admin properties error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load admin properties.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Admin approval queue
   GET /api/properties/admin/pending
   Admin
===================================================== */

export const getPendingProperties =
  async (req, res) => {
    try {
      const {
        search = "",

        page = 1,

        limit = 20,
      } = req.query;

      const filter = {
        approvalStatus:
          "pending",
      };

      if (
        String(search).trim()
      ) {
        filter.$or = [
          {
            title: {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            "location.city": {
              $regex:
                String(
                  search
                ).trim(),

              $options: "i",
            },
          },

          {
            "location.district":
              {
                $regex:
                  String(
                    search
                  ).trim(),

                $options: "i",
              },
          },
        ];
      }

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const pageSize =
        Math.min(
          Math.max(
            Number(limit) || 20,
            1
          ),
          100
        );

      const skip =
        (currentPage - 1) *
        pageSize;

      const [
        properties,

        totalProperties,
      ] = await Promise.all([
        Property.find(filter)
          .populate(
            "owner",

            "fullName email phone role"
          )
          .sort({
            submittedAt: 1,
          })
          .skip(skip)
          .limit(pageSize),

        Property.countDocuments(
          filter
        ),
      ]);

      return res
        .status(200)
        .json({
          success: true,

          properties,

          pagination: {
            currentPage,

            totalPages:
              Math.ceil(
                totalProperties /
                  pageSize
              ),

            totalProperties,

            pageSize,
          },
        });
    } catch (error) {
      console.error(
        "Get pending properties error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load pending properties.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Admin approve property
   PATCH /api/properties/admin/:id/approve
   Admin
===================================================== */

export const approveProperty =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const note =
        typeof req.body.note ===
        "string"
          ? req.body.note.trim()
          : "";

      if (
        !isValidObjectId(id)
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
        await Property.findById(
          id
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      if (
        property.approvalStatus ===
        "approved"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "This property has already been approved.",
          });
      }

      const reviewerId =
        getUserId(req);

      property.approvalStatus =
        "approved";

      property.reviewedAt =
        new Date();

      property.reviewedBy =
        reviewerId;

      property.approvalNote =
        note;

      property.rejectionReason =
        "";

      property.isActive =
        true;

      property.approvalHistory.push(
        {
          status: "approved",

          note:
            note ||
            "Property approved by administrator.",

          reviewedBy:
            reviewerId,

          reviewedAt:
            new Date(),
        }
      );

      await property.save();

      const approvedProperty =
        await Property.findById(
          property._id
        )
          .populate(
            "owner",

            "fullName email phone role"
          )
          .populate(
            "reviewedBy",

            "fullName email role"
          );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Property approved successfully.",

          property:
            approvedProperty,
        });
    } catch (error) {
      console.error(
        "Approve property error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to approve property.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Admin reject property
   PATCH /api/properties/admin/:id/reject
   Admin
===================================================== */

export const rejectProperty =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const reason =
        typeof req.body.reason ===
        "string"
          ? req.body.reason.trim()
          : "";

      const note =
        typeof req.body.note ===
        "string"
          ? req.body.note.trim()
          : "";

      if (
        !isValidObjectId(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid property ID.",
          });
      }

      if (!reason) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A rejection reason is required.",
          });
      }

      const property =
        await Property.findById(
          id
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      const reviewerId =
        getUserId(req);

      property.approvalStatus =
        "rejected";

      property.reviewedAt =
        new Date();

      property.reviewedBy =
        reviewerId;

      property.rejectionReason =
        reason;

      property.approvalNote =
        note;

      property.isFeatured =
        false;

      property.approvalHistory.push(
        {
          status: "rejected",

          note: reason,

          reviewedBy:
            reviewerId,

          reviewedAt:
            new Date(),
        }
      );

      await property.save();

      const rejectedProperty =
        await Property.findById(
          property._id
        )
          .populate(
            "owner",

            "fullName email phone role"
          )
          .populate(
            "reviewedBy",

            "fullName email role"
          );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Property rejected successfully.",

          property:
            rejectedProperty,
        });
    } catch (error) {
      console.error(
        "Reject property error:",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        const firstError =
          Object.values(
            error.errors
          )[0];

        return res
          .status(400)
          .json({
            success: false,

            message:
              firstError?.message ||
              "Property validation failed.",
          });
      }

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to reject property.",

          error:
            error.message,
        });
    }
  };

/* =====================================================
   Admin mark/unmark featured
   PATCH /api/properties/admin/:id/featured
   Admin
===================================================== */

export const updateFeaturedStatus =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
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
        await Property.findById(
          id
        );

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      const requestedStatus =
        req.body.isFeatured !==
        undefined
          ? normalizeBoolean(
              req.body
                .isFeatured,

              property.isFeatured
            )
          : !property.isFeatured;

      if (
        requestedStatus &&
        property.approvalStatus !==
          "approved"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Only approved properties can be featured.",
          });
      }

      property.isFeatured =
        requestedStatus;

      await property.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            property.isFeatured
              ? "Property added to featured listings."
              : "Property removed from featured listings.",

          property,
        });
    } catch (error) {
      console.error(
        "Update featured status error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to update featured status.",

          error:
            error.message,
        });
    }
  };


//   export const getOwnerAllProperties = async (req, res) => {
//   try {
//     const ownerId = getUserId(req);

//     const {
//       search,
//       propertyType,
//       approvalStatus,
//       sort = "newest",
//     } = req.query;

//     const filter = {
//       owner: ownerId,
//     };

//     // Search
//     if (search) {
//       filter.$or = [
//         {
//           title: {
//             $regex: search,
//             $options: "i",
//           },
//         },
//         {
//           description: {
//             $regex: search,
//             $options: "i",
//           },
//         },
//         {
//           "location.city": {
//             $regex: search,
//             $options: "i",
//           },
//         },
//         {
//           "location.address": {
//             $regex: search,
//             $options: "i",
//           },
//         },
//       ];
//     }

//     // Property Type
//     if (propertyType && propertyType !== "All") {
//       filter.propertyType = propertyType;
//     }

//     // Approval Status
//     if (approvalStatus && approvalStatus !== "All") {
//       filter.approvalStatus = approvalStatus;
//     }

//     let sortOption = {};

//     switch (sort) {
//       case "price-low":
//         sortOption = {
//           pricePerNight: 1,
//         };
//         break;

//       case "price-high":
//         sortOption = {
//           pricePerNight: -1,
//         };
//         break;

//       case "title":
//         sortOption = {
//           title: 1,
//         };
//         break;

//       case "oldest":
//         sortOption = {
//           createdAt: 1,
//         };
//         break;

//       default:
//         sortOption = {
//           createdAt: -1,
//         };
//     }

//     const properties = await Property.find(filter)
//       .populate(
//         "owner",
//         "fullName email phone"
//       )
//       .sort(sortOption);

//     return res.status(200).json({
//       success: true,
//       total: properties.length,
//       properties,
//     });
//   } catch (error) {
//     console.error(error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to fetch properties.",
//     });
//   }
// };

export const getOwnerAllProperties = async (req, res) => {
  try {
    const {
      search,
      propertyType,
      approvalStatus,
      sort = "newest",
    } = req.query;

    const filter = {};

    // Search
    if (search) {
      filter.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          description: {
            $regex: search,
            $options: "i",
          },
        },
        {
          "location.city": {
            $regex: search,
            $options: "i",
          },
        },
        {
          "location.address": {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // Property Type
    if (propertyType && propertyType !== "All") {
      filter.propertyType = propertyType;
    }

    // Approval Status
    if (approvalStatus && approvalStatus !== "All") {
      filter.approvalStatus = approvalStatus;
    }

    let sortOption = {};

    switch (sort) {
      case "price-low":
        sortOption = { pricePerNight: 1 };
        break;

      case "price-high":
        sortOption = { pricePerNight: -1 };
        break;

      case "rating":
        sortOption = { rating: -1 };
        break;

      case "featured":
        sortOption = {
          isFeatured: -1,
          createdAt: -1,
        };
        break;

      case "oldest":
        sortOption = { createdAt: 1 };
        break;

      default:
        sortOption = { createdAt: -1 };
    }

    const properties = await Property.find(filter)
      .populate("owner", "fullName email phone")
      .sort(sortOption);

    return res.status(200).json({
      success: true,
      total: properties.length,
      properties,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch properties.",
    });
  }
};
//   export const getAllProperties = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 12,
//       search,
//       propertyType,
//       city,
//       minPrice,
//       maxPrice,
//       bedrooms,
//       guests,
//       amenities,
//       sort = "newest",
//     } = req.query;

//     const filter = {
//       isActive: true,
//       approvalStatus: "approved",
//     };

//     // Search
//     if (search) {
//       filter.$or = [
//         {
//           title: {
//             $regex: search,
//             $options: "i",
//           },
//         },
//         {
//           description: {
//             $regex: search,
//             $options: "i",
//           },
//         },
//         {
//           "location.address": {
//             $regex: search,
//             $options: "i",
//           },
//         },
//       ];
//     }

//     if (propertyType) {
//       filter.propertyType = propertyType;
//     }

//     if (city) {
//       filter["location.city"] = city;
//     }

//     if (bedrooms) {
//       filter.bedrooms = {
//         $gte: Number(bedrooms),
//       };
//     }

//     if (guests) {
//       filter.maxGuests = {
//         $gte: Number(guests),
//       };
//     }

//     if (minPrice || maxPrice) {
//       filter.pricePerNight = {};

//       if (minPrice) {
//         filter.pricePerNight.$gte =
//           Number(minPrice);
//       }

//       if (maxPrice) {
//         filter.pricePerNight.$lte =
//           Number(maxPrice);
//       }
//     }

//     if (amenities) {
//       filter.amenities = {
//         $in: amenities.split(","),
//       };
//     }

//     let sortOption = {};

//     switch (sort) {
//       case "price-low":
//         sortOption = {
//           pricePerNight: 1,
//         };
//         break;

//       case "price-high":
//         sortOption = {
//           pricePerNight: -1,
//         };
//         break;

//       case "rating":
//         sortOption = {
//           rating: -1,
//         };
//         break;

//       case "featured":
//         sortOption = {
//           isFeatured: -1,
//           createdAt: -1,
//         };
//         break;

//       default:
//         sortOption = {
//           createdAt: -1,
//         };
//     }

//     const total = await Property.countDocuments(
//       filter
//     );

//     const properties =
//       await Property.find(filter)
//         .populate(
//           "owner",
//           "fullName phone email"
//         )
//         .sort(sortOption)
//         .skip((page - 1) * limit)
//         .limit(Number(limit));

//     return res.status(200).json({
//       success: true,
//       total,
//       currentPage: Number(page),
//       totalPages: Math.ceil(
//         total / limit
//       ),
//       properties,
//     });
//   } catch (error) {
//     console.error(error);

//     return res.status(500).json({
//       success: false,
//       message:
//         "Unable to fetch properties.",
//     });
//   }
// };