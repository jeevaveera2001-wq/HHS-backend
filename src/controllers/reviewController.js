import mongoose from "mongoose";

import Booking from "../models/Booking.js";
import Property from "../models/Property.js";
import Review from "../models/Review.js";

const REVIEW_STAFF_ROLES = [
  "operations_manager",
  "super_admin",
];

/* =====================================
   Helpers
===================================== */

const isValidId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const getUserId = (user) => {
  return user?._id || user?.id;
};

const isReviewStaff = (user) => {
  return REVIEW_STAFF_ROLES.includes(user?.role);
};

const populateReview = (reviewId) => {
  return Review.findById(reviewId)
    .populate(
      "customer",
      "fullName profileImage"
    )
    .populate(
      "property",
      "title location images rating totalReviews"
    )
    .populate(
      "booking",
      "bookingReference checkInDate checkOutDate"
    )
    .populate(
      "ownerReply.repliedBy",
      "fullName role"
    )
    .populate(
      "moderatedBy",
      "fullName role"
    );
};

const escapeRegex = (value = "") => {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/* =====================================
   Recalculate property rating
===================================== */

const refreshPropertyRating = async (
  propertyId
) => {
  const propertyObjectId =
    new mongoose.Types.ObjectId(
      propertyId
    );

  const [statistics] =
    await Review.aggregate([
      {
        $match: {
          property:
            propertyObjectId,

          isVisible: true,
        },
      },

      {
        $group: {
          _id: "$property",

          averageRating: {
            $avg: "$rating",
          },

          totalReviews: {
            $sum: 1,
          },
        },
      },
    ]);

  const rating = statistics
    ? Math.round(
        statistics.averageRating *
          10
      ) / 10
    : 0;

  const totalReviews =
    statistics?.totalReviews || 0;

  await Property.findByIdAndUpdate(
    propertyId,
    {
      rating,
      totalReviews,
    }
  );

  return {
    rating,
    totalReviews,
  };
};

/* =====================================
   Create verified review

   POST /api/reviews
===================================== */

export const createReview = async (
  req,
  res
) => {
  try {
    const {
      propertyId,
      bookingId,
      rating,
      title = "",
      comment,
    } = req.body;

    if (
      !isValidId(propertyId) ||
      !isValidId(bookingId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid property and booking IDs are required.",
      });
    }

    const numericRating =
      Number(rating);

    if (
      !Number.isInteger(
        numericRating
      ) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rating must be a whole number between 1 and 5.",
      });
    }

    if (
      !comment?.trim() ||
      comment.trim().length < 10
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Review comment must contain at least 10 characters.",
      });
    }

    const userId =
      getUserId(req.user);

    const booking =
      await Booking.findOne({
        _id: bookingId,
        property: propertyId,
        customer: userId,
        bookingStatus: "completed",
      });

    if (!booking) {
      return res.status(403).json({
        success: false,
        message:
          "Only customers with a completed stay can review this property.",
      });
    }

    const existingReview =
      await Review.findOne({
        booking: bookingId,
      });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message:
          "A review has already been submitted for this booking.",
      });
    }

    const review =
      await Review.create({
        customer: userId,
        property: propertyId,
        booking: bookingId,
        rating: numericRating,
        title: title.trim(),
        comment: comment.trim(),
        isVerifiedStay: true,
        isVisible: true,
      });

    const propertyRating =
      await refreshPropertyRating(
        propertyId
      );

    return res.status(201).json({
      success: true,
      message:
        "Review submitted successfully.",
      review:
        await populateReview(
          review._id
        ),
      propertyRating,
    });
  } catch (error) {
    console.error(
      "Create review error:",
      error
    );

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A review has already been submitted for this booking.",
      });
    }

    if (
      error.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          Object.values(
            error.errors
          )[0]?.message ||
          "Invalid review.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to submit the review.",
    });
  }
};

/* =====================================
   Managed review listing

   GET /api/reviews/manage
===================================== */

export const getManagedReviews =
  async (req, res) => {
    try {
      const {
        search = "",
        propertyId = "",
        rating = "all",
        visibility = "all",
        replied = "all",
        sort = "newest",
        page = 1,
        limit = 12,
      } = req.query;

      const userId =
        getUserId(req.user);

      const isOwner =
        req.user?.role === "owner";

      const propertyQuery =
        isOwner
          ? {
              owner: userId,
            }
          : {};

      const managedProperties =
        await Property.find(
          propertyQuery
        )
          .select(
            "title location owner images approvalStatus"
          )
          .sort({
            title: 1,
          });

      const managedPropertyIds =
        managedProperties.map(
          (property) => {
            return property._id;
          }
        );

      const filter = {};

      if (isOwner) {
        filter.property = {
          $in: managedPropertyIds,
        };
      }

      if (propertyId) {
        if (
          !isValidId(propertyId)
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Invalid property ID.",
            });
        }

        if (
          isOwner &&
          !managedPropertyIds.some(
            (id) => {
              return (
                id.toString() ===
                propertyId.toString()
              );
            }
          )
        ) {
          return res
            .status(403)
            .json({
              success: false,
              message:
                "You cannot manage reviews for this property.",
            });
        }

        filter.property =
          propertyId;
      }

      const numericRating =
        Number(rating);

      if (
        rating !== "all" &&
        Number.isInteger(
          numericRating
        ) &&
        numericRating >= 1 &&
        numericRating <= 5
      ) {
        filter.rating =
          numericRating;
      }

      if (search.trim()) {
        const searchExpression =
          new RegExp(
            escapeRegex(
              search.trim()
            ),
            "i"
          );

        filter.$or = [
          {
            title:
              searchExpression,
          },
          {
            comment:
              searchExpression,
          },
          {
            moderationNote:
              searchExpression,
          },
          {
            "ownerReply.message":
              searchExpression,
          },
        ];
      }

      const statisticsFilter = {
        ...filter,
      };

      if (
        visibility ===
        "visible"
      ) {
        filter.isVisible = true;
      }

      if (
        visibility ===
        "hidden"
      ) {
        filter.isVisible = false;
      }

      if (
        replied === "replied"
      ) {
        filter[
          "ownerReply.message"
        ] = {
          $exists: true,
          $ne: "",
        };
      }

      if (
        replied ===
        "unreplied"
      ) {
        filter.$and = [
          {
            $or: [
              {
                "ownerReply.message": {
                  $exists: false,
                },
              },
              {
                "ownerReply.message":
                  "",
              },
              {
                "ownerReply.message":
                  null,
              },
            ],
          },
        ];
      }

      const sortOptions = {
        newest: {
          createdAt: -1,
        },

        oldest: {
          createdAt: 1,
        },

        highest: {
          rating: -1,
          createdAt: -1,
        },

        lowest: {
          rating: 1,
          createdAt: -1,
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
          100
        );

      const [
        reviews,
        totalReviews,
        statisticsResult,
      ] = await Promise.all([
        Review.find(filter)
          .populate(
            "customer",
            "fullName email phone profileImage"
          )
          .populate({
            path: "property",
            select:
              "title location images owner rating totalReviews",
            populate: {
              path: "owner",
              select:
                "fullName email",
            },
          })
          .populate(
            "booking",
            "bookingReference checkInDate checkOutDate bookingStatus"
          )
          .populate(
            "ownerReply.repliedBy",
            "fullName role"
          )
          .populate(
            "moderatedBy",
            "fullName role"
          )
          .sort(
            sortOptions[sort] ||
              sortOptions.newest
          )
          .skip(
            (currentPage - 1) *
              pageSize
          )
          .limit(pageSize),

        Review.countDocuments(
          filter
        ),

        Review.aggregate([
          {
            $match:
              statisticsFilter,
          },
          {
            $group: {
              _id: null,

              total: {
                $sum: 1,
              },

              visible: {
                $sum: {
                  $cond: [
                    "$isVisible",
                    1,
                    0,
                  ],
                },
              },

              hidden: {
                $sum: {
                  $cond: [
                    "$isVisible",
                    0,
                    1,
                  ],
                },
              },

              replied: {
                $sum: {
                  $cond: [
                    {
                      $gt: [
                        {
                          $strLenCP: {
                            $ifNull: [
                              "$ownerReply.message",
                              "",
                            ],
                          },
                        },
                        0,
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
      ]);

      const groupedStatistics =
        statisticsResult[0] || {
          total: 0,
          visible: 0,
          hidden: 0,
          replied: 0,
        };

      const statistics = {
        total:
          groupedStatistics.total ||
          0,

        visible:
          groupedStatistics.visible ||
          0,

        hidden:
          groupedStatistics.hidden ||
          0,

        replied:
          groupedStatistics.replied ||
          0,

        unreplied:
          (groupedStatistics.total ||
            0) -
          (groupedStatistics.replied ||
            0),
      };

      return res.status(200).json({
        success: true,
        count: reviews.length,
        reviews,
        managedProperties,
        statistics,

        pagination: {
          currentPage,

          totalPages:
            Math.ceil(
              totalReviews /
                pageSize
            ),

          totalReviews,
          pageSize,
        },
      });
    } catch (error) {
      console.error(
        "Get managed reviews error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load managed reviews.",
      });
    }
  };

/* =====================================
   Public property reviews

   GET /api/reviews/property/:propertyId
===================================== */

export const getPropertyReviews =
  async (req, res) => {
    try {
      const { propertyId } =
        req.params;

      const {
        page = 1,
        limit = 10,
        sort = "newest",
      } = req.query;

      if (
        !isValidId(propertyId)
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
        await Property.findOne({
          _id: propertyId,
          approvalStatus:
            "approved",
        }).select(
          "title rating totalReviews"
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

      const sortOptions = {
        newest: {
          createdAt: -1,
        },

        oldest: {
          createdAt: 1,
        },

        highest: {
          rating: -1,
          createdAt: -1,
        },

        lowest: {
          rating: 1,
          createdAt: -1,
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
            Number(limit) || 10,
            1
          ),
          50
        );

      const filter = {
        property: propertyId,
        isVisible: true,
      };

      const [
        reviews,
        totalReviews,
      ] = await Promise.all([
        Review.find(filter)
          .populate(
            "customer",
            "fullName profileImage"
          )
          .populate(
            "ownerReply.repliedBy",
            "fullName role"
          )
          .sort(
            sortOptions[sort] ||
              sortOptions.newest
          )
          .skip(
            (currentPage - 1) *
              pageSize
          )
          .limit(pageSize),

        Review.countDocuments(
          filter
        ),
      ]);

      return res.status(200).json({
        success: true,

        property: {
          id: property._id,
          title: property.title,
          rating: property.rating,
          totalReviews:
            property.totalReviews,
        },

        reviews,

        pagination: {
          currentPage,

          totalPages:
            Math.ceil(
              totalReviews /
                pageSize
            ),

          totalReviews,
          pageSize,
        },
      });
    } catch (error) {
      console.error(
        "Get property reviews error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load property reviews.",
      });
    }
  };

/* =====================================
   Logged-in customer's reviews

   GET /api/reviews/my-reviews
===================================== */

export const getMyReviews = async (
  req,
  res
) => {
  try {
    const reviews =
      await Review.find({
        customer:
          getUserId(req.user),
      })
        .populate(
          "property",
          "title location images rating totalReviews"
        )
        .populate(
          "booking",
          "bookingReference checkInDate checkOutDate"
        )
        .populate(
          "ownerReply.repliedBy",
          "fullName role"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error(
      "Get my reviews error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load your reviews.",
    });
  }
};

/* =====================================
   Update review

   PUT /api/reviews/:id
===================================== */

export const updateReview = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const {
      rating,
      title,
      comment,
    } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid review ID.",
      });
    }

    const review =
      await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found.",
      });
    }

    if (
      review.customer.toString() !==
      getUserId(
        req.user
      ).toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You cannot update this review.",
      });
    }

    if (rating !== undefined) {
      const numericRating =
        Number(rating);

      if (
        !Number.isInteger(
          numericRating
        ) ||
        numericRating < 1 ||
        numericRating > 5
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Rating must be a whole number between 1 and 5.",
          });
      }

      review.rating =
        numericRating;
    }

    if (title !== undefined) {
      review.title =
        String(title).trim();
    }

    if (comment !== undefined) {
      review.comment =
        String(comment).trim();
    }

    await review.save();

    const propertyRating =
      await refreshPropertyRating(
        review.property
      );

    return res.status(200).json({
      success: true,
      message:
        "Review updated successfully.",
      review:
        await populateReview(
          review._id
        ),
      propertyRating,
    });
  } catch (error) {
    console.error(
      "Update review error:",
      error
    );

    if (
      error.name ===
      "ValidationError"
    ) {
      return res.status(400).json({
        success: false,
        message:
          Object.values(
            error.errors
          )[0]?.message ||
          "Invalid review.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to update the review.",
    });
  }
};

/* =====================================
   Delete review

   DELETE /api/reviews/:id
===================================== */

export const deleteReview = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid review ID.",
      });
    }

    const review =
      await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found.",
      });
    }

    const isCustomer =
      review.customer.toString() ===
      getUserId(
        req.user
      )?.toString();

    if (
      !isCustomer &&
      !isReviewStaff(req.user)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You cannot delete this review.",
      });
    }

    const propertyId =
      review.property;

    await review.deleteOne();

    const propertyRating =
      await refreshPropertyRating(
        propertyId
      );

    return res.status(200).json({
      success: true,
      message:
        "Review deleted successfully.",
      propertyRating,
    });
  } catch (error) {
    console.error(
      "Delete review error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to delete the review.",
    });
  }
};

/* =====================================
   Property-owner reply

   PATCH /api/reviews/:id/reply
===================================== */

export const replyToReview = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid review ID.",
      });
    }

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Reply message is required.",
      });
    }

    const review =
      await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found.",
      });
    }

    const property =
      await Property.findById(
        review.property
      ).select("owner");

    const isOwner =
      property?.owner?.toString() ===
      getUserId(
        req.user
      )?.toString();

    if (
      !isOwner &&
      !isReviewStaff(req.user)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You cannot reply to this review.",
      });
    }

    review.ownerReply = {
      message: message.trim(),
      repliedBy:
        getUserId(req.user),
      repliedAt: new Date(),
    };

    await review.save();

    return res.status(200).json({
      success: true,
      message:
        "Reply added successfully.",
      review:
        await populateReview(
          review._id
        ),
    });
  } catch (error) {
    console.error(
      "Reply to review error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to add the review reply.",
    });
  }
};

/* =====================================
   Review visibility moderation

   PATCH /api/reviews/:id/visibility
===================================== */

export const updateReviewVisibility =
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        isVisible,
        note = "",
      } = req.body;

      if (!isValidId(id)) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid review ID.",
          });
      }

      if (
        typeof isVisible !==
        "boolean"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "isVisible must be true or false.",
          });
      }

      const review =
        await Review.findById(id);

      if (!review) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Review not found.",
          });
      }

      review.isVisible =
        isVisible;

      review.moderationNote =
        note.trim();

      review.moderatedBy =
        getUserId(req.user);

      review.moderatedAt =
        new Date();

      await review.save();

      const propertyRating =
        await refreshPropertyRating(
          review.property
        );

      return res.status(200).json({
        success: true,

        message: isVisible
          ? "Review is now publicly visible."
          : "Review has been hidden.",

        review:
          await populateReview(
            review._id
          ),

        propertyRating,
      });
    } catch (error) {
      console.error(
        "Update review visibility error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update review visibility.",
      });
    }
  };