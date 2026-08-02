import User from "../models/User.js";
import Property from "../models/Property.js";
import Booking from "../models/Booking.js";

const STAFF_ROLES = [
  "support",
  "property_admin",
  "booking_manager",
  "finance_manager",
  "operations_manager",
  "super_admin",
];

/* =====================================
   Get Super Admin dashboard statistics
===================================== */

export const getDashboardStatistics = async (
  req,
  res
) => {
  try {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalCustomers,
      totalOwners,
      totalStaff,

      totalProperties,
      activeProperties,
      suspendedProperties,
      pendingProperties,
      approvedProperties,
      rejectedProperties,
      featuredProperties,

      totalBookings,
      pendingBookings,
      confirmedBookings,
      checkedInBookings,
      completedBookings,
      cancelledBookings,
      refundPendingBookings,

      paidBookings,
      revenueResult,
      bookingValueResult,

      recentUsers,
      recentProperties,
      recentBookings,
    ] = await Promise.all([
      /* User statistics */

      User.countDocuments(),

      User.countDocuments({
        isActive: true,
      }),

      User.countDocuments({
        isActive: false,
      }),

      User.countDocuments({
        role: "customer",
      }),

      User.countDocuments({
        role: "owner",
      }),

      User.countDocuments({
        role: {
          $in: STAFF_ROLES,
        },
      }),

      /* Property statistics */

      Property.countDocuments(),

      Property.countDocuments({
        isActive: true,
      }),

      Property.countDocuments({
        isActive: false,
      }),

      Property.countDocuments({
        approvalStatus: "pending",
      }),

      Property.countDocuments({
        approvalStatus: "approved",
        isActive: true,
      }),

      Property.countDocuments({
        approvalStatus: "rejected",
      }),

      Property.countDocuments({
        isFeatured: true,
        isActive: true,
        approvalStatus: "approved",
      }),

      /* Booking statistics */

      Booking.countDocuments(),

      Booking.countDocuments({
        bookingStatus: "pending",
      }),

      Booking.countDocuments({
        bookingStatus: "confirmed",
      }),

      Booking.countDocuments({
        bookingStatus: "checked_in",
      }),

      Booking.countDocuments({
        bookingStatus: "completed",
      }),

      Booking.countDocuments({
        bookingStatus: {
          $in: [
            "cancelled",
            "refunded",
            "no_show",
          ],
        },
      }),

      Booking.countDocuments({
        bookingStatus: "refund_pending",
      }),

      Booking.countDocuments({
        paymentStatus: "paid",
      }),

      /* Successfully collected revenue */

      Booking.aggregate([
        {
          $match: {
            paymentStatus: "paid",
            bookingStatus: {
              $nin: [
                "cancelled",
                "refunded",
              ],
            },
          },
        },

        {
          $group: {
            _id: null,

            totalRevenue: {
              $sum:
                "$priceDetails.grandTotal",
            },
          },
        },
      ]),

      /* Total value of all non-cancelled bookings */

      Booking.aggregate([
        {
          $match: {
            bookingStatus: {
              $nin: [
                "cancelled",
                "refunded",
              ],
            },
          },
        },

        {
          $group: {
            _id: null,

            totalBookingValue: {
              $sum:
                "$priceDetails.grandTotal",
            },
          },
        },
      ]),

      /* Recent users */

      User.find()
        .select(
          "fullName email phone role isActive createdAt"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5),

      /* Recent properties */

      Property.find()
        .select(
          "title propertyType approvalStatus isActive pricePerNight createdAt owner"
        )
        .populate(
          "owner",
          "fullName email"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5),

      /* Recent bookings */

      Booking.find()
        .select(
          "bookingReference customer property bookingStatus paymentStatus priceDetails.grandTotal checkInDate checkOutDate createdAt"
        )
        .populate(
          "customer",
          "fullName email phone"
        )
        .populate(
          "property",
          "title location"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5),
    ]);

    const totalRevenue =
      revenueResult[0]?.totalRevenue || 0;

    const totalBookingValue =
      bookingValueResult[0]
        ?.totalBookingValue || 0;

    return res.status(200).json({
      success: true,

      statistics: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
          customers: totalCustomers,
          owners: totalOwners,
          staff: totalStaff,
        },

        properties: {
          total: totalProperties,
          active: activeProperties,
          suspended:
            suspendedProperties,
          pending: pendingProperties,
          approved: approvedProperties,
          rejected: rejectedProperties,
          featured: featuredProperties,
        },

        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          confirmed: confirmedBookings,
          checkedIn: checkedInBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
          refundPending:
            refundPendingBookings,
          paid: paidBookings,
        },

        finance: {
          totalRevenue,
          totalBookingValue,
        },
      },

      recentActivity: {
        users: recentUsers,
        properties: recentProperties,
        bookings: recentBookings,
      },
    });
  } catch (error) {
    console.error(
      "Dashboard statistics error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load dashboard statistics.",
    });
  }
};