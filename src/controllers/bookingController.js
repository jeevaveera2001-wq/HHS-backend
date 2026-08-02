import mongoose from "mongoose";

import Booking from "../models/Booking.js";
import Property from "../models/Property.js";

import {
  sendBookingCancelledEmail,
  sendBookingCreatedEmail,
  sendBookingStatusEmail,
} from "../services/emailService.js";

const BOOKING_STAFF_ROLES = [
  "booking_manager",
  "operations_manager",
  "super_admin",
];

const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
];

const STATUS_TRANSITIONS = {
  pending: [
    "confirmed",
    "cancelled",
  ],

  confirmed: [
    "checked_in",
    "cancelled",
    "no_show",
  ],

  checked_in: [
    "completed",
  ],

  completed: [],
  cancelled: [],
  expired: [],
  refund_pending: [],
  refunded: [],
  no_show: [],
};

/* =====================================
   Helpers
===================================== */

const isValidId = (id) => {
  return mongoose.Types.ObjectId.isValid(
    id
  );
};

const getUserId = (user) => {
  return user?._id || user?.id;
};

const isBookingStaff = (
  user
) => {
  return BOOKING_STAFF_ROLES.includes(
    user?.role
  );
};

const calculateNights = (
  checkInDate,
  checkOutDate
) => {
  return Math.ceil(
    (
      checkOutDate.getTime() -
      checkInDate.getTime()
    ) /
      (1000 * 60 * 60 * 24)
  );
};

const getBookingHoldMinutes =
  () => {
    const configuredMinutes =
      Number(
        process.env
          .BOOKING_HOLD_MINUTES
      );

    if (
      Number.isFinite(
        configuredMinutes
      ) &&
      configuredMinutes >= 5 &&
      configuredMinutes <= 120
    ) {
      return configuredMinutes;
    }

    return 15;
  };

const createHoldExpiry = () => {
  return new Date(
    Date.now() +
      getBookingHoldMinutes() *
        60 *
        1000
  );
};

const populateBooking = (
  bookingId
) => {
  return Booking.findById(
    bookingId
  )
    .populate(
      "customer",
      "fullName email phone"
    )
    .populate(
      "property",
      "title propertyType location images pricePerNight"
    )
    .populate(
      "owner",
      "fullName email phone"
    )
    .populate(
      "internalNotes.addedBy",
      "fullName role"
    );
};

/* =====================================
   Calculate available rooms
===================================== */

const getAvailableRooms =
  async ({
    propertyId,
    checkInDate,
    checkOutDate,
    excludeBookingId = null,
  }) => {
    await Booking.expireStaleHolds();

    const query = {
      property: propertyId,

      bookingStatus: {
        $in:
          ACTIVE_BOOKING_STATUSES,
      },

      checkInDate: {
        $lt: checkOutDate,
      },

      checkOutDate: {
        $gt: checkInDate,
      },
    };

    if (excludeBookingId) {
      query._id = {
        $ne: excludeBookingId,
      };
    }

    const [
      bookings,
      property,
    ] = await Promise.all([
      Booking.find(query).select(
        "numberOfRooms"
      ),

      Property.findById(
        propertyId
      ).select("totalRooms"),
    ]);

    if (!property) {
      return 0;
    }

    const bookedRooms =
      bookings.reduce(
        (total, booking) => {
          return (
            total +
            booking.numberOfRooms
          );
        },
        0
      );

    return Math.max(
      property.totalRooms -
        bookedRooms,
      0
    );
  };

/* =====================================
   Create booking

   POST /api/bookings
===================================== */

export const createBooking =
  async (req, res) => {
    try {
      const {
        propertyId,
        checkInDate,
        checkOutDate,
        numberOfRooms,
        numberOfGuests,
        guests,
        primaryGuest,
        specialRequests,
      } = req.body;

      if (
        !propertyId ||
        !checkInDate ||
        !checkOutDate ||
        numberOfRooms ===
          undefined ||
        numberOfGuests ===
          undefined ||
        !primaryGuest?.fullName ||
        !primaryGuest?.email ||
        !primaryGuest?.phone
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Complete all required booking details.",
          });
      }

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
          isActive: true,
          approvalStatus:
            "approved",
        });

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property is unavailable or not approved.",
          });
      }

      const checkIn =
        new Date(checkInDate);

      const checkOut =
        new Date(checkOutDate);

      if (
        Number.isNaN(
          checkIn.getTime()
        ) ||
        Number.isNaN(
          checkOut.getTime()
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid booking dates.",
          });
      }

      checkIn.setHours(
        0,
        0,
        0,
        0
      );

      checkOut.setHours(
        0,
        0,
        0,
        0
      );

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      if (checkIn < today) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Check-in date cannot be in the past.",
          });
      }

      if (
        checkOut <= checkIn
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Check-out date must be after check-in date.",
          });
      }

      const rooms = Number(
        numberOfRooms
      );

      const guestCount = Number(
        numberOfGuests
      );

      if (
        !Number.isInteger(
          rooms
        ) ||
        rooms < 1
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Number of rooms must be at least one.",
          });
      }

      if (
        !Number.isInteger(
          guestCount
        ) ||
        guestCount < 1
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Number of guests must be at least one.",
          });
      }

      if (
        guestCount >
        property.maxGuests * rooms
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Guest count exceeds property capacity.",
          });
      }

      const availableRooms =
        await getAvailableRooms({
          propertyId:
            property._id,

          checkInDate: checkIn,

          checkOutDate:
            checkOut,
        });

      if (
        rooms > availableRooms
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              availableRooms === 0
                ? "No rooms are available for the selected dates."
                : `Only ${availableRooms} room(s) are available for the selected dates.`,

            availableRooms,
          });
      }

      const numberOfNights =
        calculateNights(
          checkIn,
          checkOut
        );

      const pricePerNight =
        property.pricePerNight;

      const roomTotal =
        pricePerNight *
        rooms *
        numberOfNights;

      const serviceFee =
        Math.round(
          roomTotal * 0.05
        );

      const taxes =
        Math.round(
          roomTotal * 0.12
        );

      const discount = 0;

      const grandTotal =
        roomTotal +
        serviceFee +
        taxes -
        discount;

      const booking =
        await Booking.create({
          customer:
            req.user._id,

          property:
            property._id,

          owner:
            property.owner,

          checkInDate:
            checkIn,

          checkOutDate:
            checkOut,

          numberOfNights,

          numberOfRooms:
            rooms,

          numberOfGuests:
            guestCount,

          guests:
            Array.isArray(
              guests
            )
              ? guests
              : [],

          primaryGuest: {
            fullName:
              primaryGuest.fullName.trim(),

            email:
              primaryGuest.email
                .trim()
                .toLowerCase(),

            phone:
              primaryGuest.phone.trim(),
          },

          priceDetails: {
            pricePerNight,
            roomTotal,
            serviceFee,
            taxes,
            discount,
            grandTotal,
          },

          specialRequests:
            specialRequests?.trim() ||
            "",

          bookingStatus:
            "pending",

          paymentStatus:
            "pending",

          holdExpiresAt:
            createHoldExpiry(),

          expiredAt: null,

          paymentMethod:
            "not_selected",
        });

      const populatedBooking =
        await populateBooking(
          booking._id
        );

      void sendBookingCreatedEmail(
        populatedBooking
      );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Booking created successfully. Complete payment to confirm it.",

          booking:
            populatedBooking,
        });
    } catch (error) {
      console.error(
        "Create booking error:",
        error
      );

      if (
        error.code === 11000
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Booking reference conflict. Please try again.",
          });
      }

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
            .join(", ");

        return res
          .status(400)
          .json({
            success: false,
            message,
          });
      }

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to create booking.",
        });
    }
  };

/* =====================================
   Check availability

   GET /api/bookings/availability
===================================== */

export const checkAvailability =
  async (req, res) => {
    try {
      const {
        propertyId,
        checkInDate,
        checkOutDate,
      } = req.query;

      if (
        !isValidId(
          propertyId
        ) ||
        !checkInDate ||
        !checkOutDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Property, check-in and check-out are required.",
          });
      }

      const property =
        await Property.findOne({
          _id: propertyId,
          isActive: true,

          approvalStatus:
            "approved",
        });

      if (!property) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Property not found.",
          });
      }

      const checkIn =
        new Date(checkInDate);

      const checkOut =
        new Date(checkOutDate);

      if (
        Number.isNaN(
          checkIn.getTime()
        ) ||
        Number.isNaN(
          checkOut.getTime()
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Provide valid booking dates.",
          });
      }

      checkIn.setHours(
        0,
        0,
        0,
        0
      );

      checkOut.setHours(
        0,
        0,
        0,
        0
      );

      if (
        checkOut <= checkIn
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Check-out date must be after check-in date.",
          });
      }

      const availableRooms =
        await getAvailableRooms({
          propertyId,

          checkInDate:
            checkIn,

          checkOutDate:
            checkOut,
        });

      return res
        .status(200)
        .json({
          success: true,

          available:
            availableRooms > 0,

          availableRooms,

          totalRooms:
            property.totalRooms,
        });
    } catch (error) {
      console.error(
        "Availability error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to check room availability.",
        });
    }
  };

/* =====================================
   Get customer bookings

   GET /api/bookings/my-bookings
===================================== */

export const getMyBookings =
  async (req, res) => {
    try {
      await Booking.expireStaleHolds();

      const bookings =
        await Booking.find({
          customer:
            req.user._id,
        })
          .populate(
            "property",
            "title propertyType location images pricePerNight"
          )
          .populate(
            "owner",
            "fullName phone"
          )
          .sort({
            createdAt: -1,
          });

      return res
        .status(200)
        .json({
          success: true,

          count:
            bookings.length,

          bookings,
        });
    } catch (error) {
      console.error(
        "Get customer bookings error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load your bookings.",
        });
    }
  };

/* =====================================
   Get owner bookings

   GET /api/bookings/owner-bookings
===================================== */

export const getOwnerBookings =
  async (req, res) => {
    try {
      await Booking.expireStaleHolds();

      const bookings =
        await Booking.find({
          owner: req.user._id,
        })
          .populate(
            "customer",
            "fullName email phone"
          )
          .populate(
            "property",
            "title propertyType location images"
          )
          .sort({
            createdAt: -1,
          });

      return res
        .status(200)
        .json({
          success: true,

          count:
            bookings.length,

          bookings,
        });
    } catch (error) {
      console.error(
        "Get owner bookings error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load property bookings.",
        });
    }
  };

/* =====================================
   Get all bookings

   GET /api/bookings/manage
===================================== */

export const getAllBookings =
  async (req, res) => {
    try {
      await Booking.expireStaleHolds();

      const {
        search = "",
        bookingStatus = "",
        paymentStatus = "",
        page = 1,
        limit = 20,
      } = req.query;

      const query = {};

      if (bookingStatus) {
        query.bookingStatus =
          bookingStatus;
      }

      if (paymentStatus) {
        query.paymentStatus =
          paymentStatus;
      }

      if (search.trim()) {
        query.bookingReference =
          {
            $regex:
              search.trim(),

            $options: "i",
          };
      }

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const pageLimit =
        Math.min(
          Math.max(
            Number(limit) || 20,
            1
          ),
          100
        );

      const skip =
        (currentPage - 1) *
        pageLimit;

      const [
        bookings,
        totalBookings,
      ] = await Promise.all([
        Booking.find(query)
          .populate(
            "customer",
            "fullName email phone"
          )
          .populate(
            "property",
            "title propertyType location images"
          )
          .populate(
            "owner",
            "fullName email phone"
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(pageLimit),

        Booking.countDocuments(
          query
        ),
      ]);

      return res
        .status(200)
        .json({
          success: true,

          count:
            bookings.length,

          totalBookings,

          currentPage,

          totalPages:
            Math.ceil(
              totalBookings /
                pageLimit
            ),

          bookings,
        });
    } catch (error) {
      console.error(
        "Get all bookings error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load bookings.",
        });
    }
  };

/* =====================================
   Get individual booking

   GET /api/bookings/:id
===================================== */

export const getBookingById =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (!isValidId(id)) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid booking ID.",
          });
      }

      await Booking.expireStaleHolds();

      const booking =
        await populateBooking(id);

      if (!booking) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Booking not found.",
          });
      }

      const userId =
        getUserId(
          req.user
        )?.toString();

      const isCustomer =
        booking.customer?._id?.toString() ===
        userId;

      const isOwner =
        booking.owner?._id?.toString() ===
        userId;

      if (
        !isCustomer &&
        !isOwner &&
        !isBookingStaff(
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot access this booking.",
          });
      }

      return res
        .status(200)
        .json({
          success: true,
          booking,
        });
    } catch (error) {
      console.error(
        "Get booking error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load booking.",
        });
    }
  };

/* =====================================
   Update booking status

   PATCH /api/bookings/:id/status
===================================== */

export const updateBookingStatus =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        bookingStatus,
        reason = "",
      } = req.body;

      if (!isValidId(id)) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid booking ID.",
          });
      }

      if (!bookingStatus) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Booking status is required.",
          });
      }

      await Booking.expireStaleHolds();

      const booking =
        await Booking.findById(
          id
        );

      if (!booking) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Booking not found.",
          });
      }

      const userId =
        getUserId(
          req.user
        )?.toString();

      const isOwner =
        booking.owner.toString() ===
        userId;

      if (
        !isOwner &&
        !isBookingStaff(
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot update this booking.",
          });
      }

      const allowedNextStatuses =
        STATUS_TRANSITIONS[
          booking.bookingStatus
        ] || [];

      if (
        !allowedNextStatuses.includes(
          bookingStatus
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              `Cannot change booking from ` +
              `${booking.bookingStatus} to ${bookingStatus}.`,

            allowedStatuses:
              allowedNextStatuses,
          });
      }

      if (
        bookingStatus ===
          "confirmed" &&
        booking.paymentStatus !==
          "paid"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A booking must be paid before it can be confirmed.",
          });
      }

      booking.bookingStatus =
        bookingStatus;

      if (
        bookingStatus ===
        "confirmed"
      ) {
        booking.confirmedAt =
          new Date();
      }

      if (
        bookingStatus ===
        "checked_in"
      ) {
        booking.checkedInAt =
          new Date();
      }

      if (
        bookingStatus ===
        "completed"
      ) {
        booking.completedAt =
          new Date();
      }

      if (
        bookingStatus ===
        "cancelled"
      ) {
        booking.cancellation.requestedAt =
          new Date();

        booking.cancellation.cancelledAt =
          new Date();

        booking.cancellation.cancelledBy =
          req.user._id;

        booking.cancellation.reason =
          reason.trim() ||
          "Cancelled by management";

        booking.cancellation.refundAmount =
          0;
      }

      await booking.save();

      const populatedBooking =
        await populateBooking(
          booking._id
        );

      if (
        bookingStatus ===
        "cancelled"
      ) {
        void sendBookingCancelledEmail(
          populatedBooking
        );
      } else {
        void sendBookingStatusEmail(
          populatedBooking
        );
      }

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Booking status updated successfully.",

          booking:
            populatedBooking,
        });
    } catch (error) {
      console.error(
        "Update booking status error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to update booking status.",
        });
    }
  };

/* =====================================
   Cancel booking

   PATCH /api/bookings/:id/cancel
===================================== */

export const cancelBooking =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        reason = "",
      } = req.body;

      if (!isValidId(id)) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid booking ID.",
          });
      }

      await Booking.expireStaleHolds();

      const booking =
        await Booking.findById(
          id
        );

      if (!booking) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Booking not found.",
          });
      }

      const userId =
        getUserId(
          req.user
        )?.toString();

      const isCustomer =
        booking.customer.toString() ===
        userId;

      const isOwner =
        booking.owner.toString() ===
        userId;

      if (
        !isCustomer &&
        !isOwner &&
        !isBookingStaff(
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot cancel this booking.",
          });
      }

      if (
        ![
          "pending",
          "confirmed",
        ].includes(
          booking.bookingStatus
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "This booking can no longer be cancelled.",
          });
      }

      const requiresRefund =
        [
          "paid",
          "partially_refunded",
        ].includes(
          booking.paymentStatus
        );

      booking.bookingStatus =
        "cancelled";

      booking.cancellation.requestedAt =
        new Date();

      booking.cancellation.cancelledAt =
        new Date();

      booking.cancellation.cancelledBy =
        req.user._id;

      booking.cancellation.reason =
        reason.trim() ||
        "No reason provided";

      booking.cancellation.refundAmount =
        0;

      await booking.save();

      const populatedBooking =
        await populateBooking(
          booking._id
        );

      void sendBookingCancelledEmail(
        populatedBooking
      );

      return res
        .status(200)
        .json({
          success: true,

          message:
            requiresRefund
              ? "Booking cancelled. An authorized staff member must initiate the refund."
              : "Booking cancelled successfully.",

          requiresRefund,

          booking:
            populatedBooking,
        });
    } catch (error) {
      console.error(
        "Cancel booking error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to cancel booking.",
        });
    }
  };