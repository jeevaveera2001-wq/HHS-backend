import crypto from "crypto";
import mongoose from "mongoose";

import {
  getRazorpayClient,
  getRazorpayKeyId,
  isRazorpayConfigured,
} from "../config/razorpay.js";

import Booking from "../models/Booking.js";

import {
  sendLatePaymentCapturedEmail,
  sendPaymentSuccessfulEmail,
  sendRefundStatusEmail,
} from "../services/emailService.js";

/* =====================================
   Payment roles
===================================== */

const PAYMENT_STAFF_ROLES = [
  "finance_manager",
  "booking_manager",
  "operations_manager",
  "super_admin",
];

/* =====================================
   Helpers
===================================== */

const isValidId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const isPaymentStaff = (user) => {
  return PAYMENT_STAFF_ROLES.includes(
    user?.role
  );
};

const getUserId = (user) => {
  return user?._id || user?.id;
};

const ownsBooking = (
  booking,
  user
) => {
  const userId = getUserId(user);

  if (!userId) {
    return false;
  }

  return [
    booking.customer,
    booking.owner,
  ].some((value) => {
    return (
      value?.toString() ===
      userId.toString()
    );
  });
};

const canAccessPayment = (
  booking,
  user
) => {
  return (
    ownsBooking(booking, user) ||
    isPaymentStaff(user)
  );
};

const toPaise = (amount) => {
  const value = Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 0;
  }

  return Math.round(value * 100);
};

const getBookingHoldMinutes = () => {
  const configuredMinutes = Number(
    process.env.BOOKING_HOLD_MINUTES
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

const safeSignatureEqual = (
  expected,
  received
) => {
  if (!expected || !received) {
    return false;
  }

  const expectedBuffer =
    Buffer.from(
      String(expected),
      "utf8"
    );

  const receivedBuffer =
    Buffer.from(
      String(received),
      "utf8"
    );

  return (
    expectedBuffer.length ===
      receivedBuffer.length &&
    crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    )
  );
};

const populateBooking = async (
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
      "title propertyType location images"
    )
    .populate(
      "owner",
      "fullName email phone"
    );
};

const serializePayment = (
  booking
) => {
  return {
    bookingId: booking._id,

    bookingReference:
      booking.bookingReference,

    bookingStatus:
      booking.bookingStatus,

    paymentStatus:
      booking.paymentStatus,

    paymentMethod:
      booking.paymentMethod,

    amount:
      booking.priceDetails
        .grandTotal,

    currency:
      booking.payment?.currency ||
      "INR",

    orderId:
      booking.payment
        ?.razorpayOrderId || "",

    paymentId:
      booking.payment
        ?.razorpayPaymentId || "",

    paidAt:
      booking.payment?.paidAt ||
      null,

    holdExpiresAt:
      booking.holdExpiresAt ||
      null,

    expiredAt:
      booking.expiredAt || null,

    refunds:
      booking.refunds || [],
  };
};

/* =====================================
   Mark payment as captured
===================================== */

const markCapturedPayment = async ({
  booking,
  paymentEntity,
  signature = "",
}) => {
  const expectedAmount = toPaise(
    booking.priceDetails.grandTotal
  );

  if (
    paymentEntity.order_id !==
      booking.payment
        ?.razorpayOrderId ||
    paymentEntity.amount !==
      expectedAmount ||
    paymentEntity.currency !==
      "INR" ||
    paymentEntity.status !==
      "captured"
  ) {
    const error = new Error(
      "Razorpay payment details do not match this booking or the payment is not captured."
    );

    error.status = 409;

    throw error;
  }

  /*
     Prevent duplicate success emails when
     payment verification and webhook both run.
  */

  if (
    booking.payment
      ?.razorpayPaymentId ===
      paymentEntity.id &&
    [
      "paid",
      "refund_pending",
      "partially_refunded",
      "refunded",
    ].includes(
      booking.paymentStatus
    )
  ) {
    return {
      requiresRefund:
        booking.paymentStatus ===
          "refund_pending" ||
        booking.bookingStatus ===
          "refund_pending",

      newlyCaptured: false,
    };
  }

  const capturedAfterExpiry =
    booking.bookingStatus ===
    "expired";

  booking.paymentStatus =
    capturedAfterExpiry
      ? "refund_pending"
      : "paid";

  booking.paymentMethod =
    "online";

  booking.paymentTransactionId =
    paymentEntity.id;

  booking.payment.provider =
    "razorpay";

  booking.payment.currency =
    "INR";

  booking.payment.amountInSubunits =
    paymentEntity.amount;

  booking.payment.razorpayPaymentId =
    paymentEntity.id;

  booking.payment.razorpaySignature =
    signature;

  booking.payment.orderStatus =
    "paid";

  booking.payment.failureCode =
    "";

  booking.payment.failureDescription =
    "";

  booking.payment.paidAt =
    new Date();

  booking.holdExpiresAt = null;

  if (capturedAfterExpiry) {
    booking.bookingStatus =
      "refund_pending";

    booking.cancellation.requestedAt =
      new Date();

    booking.cancellation.cancelledAt =
      new Date();

    booking.cancellation.cancelledBy =
      null;

    booking.cancellation.reason =
      "Payment was captured after the temporary booking hold expired.";

    booking.cancellation.refundAmount =
      booking.priceDetails.grandTotal;
  } else if (
    booking.bookingStatus ===
    "pending"
  ) {
    booking.bookingStatus =
      "confirmed";

    booking.confirmedAt =
      new Date();
  }

  await booking.save();

  const populatedBooking =
    await populateBooking(
      booking._id
    );

  if (capturedAfterExpiry) {
    void sendLatePaymentCapturedEmail(
      populatedBooking
    );
  } else {
    void sendPaymentSuccessfulEmail(
      populatedBooking
    );
  }

  return {
    requiresRefund:
      capturedAfterExpiry,

    newlyCaptured: true,
  };
};

/* =====================================
   Create Razorpay order

   POST /api/payments/order
===================================== */

export const createRazorpayOrder =
  async (req, res) => {
    try {
      const { bookingId } =
        req.body;

      if (!isValidId(bookingId)) {
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
          bookingId
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
        getUserId(req.user);

      if (
        !userId ||
        booking.customer.toString() !==
          userId.toString()
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot pay for this booking.",
          });
      }

      if (
        booking.paymentStatus ===
        "paid"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "This booking has already been paid.",
          });
      }

      if (
        booking.bookingStatus ===
        "expired"
      ) {
        return res
          .status(410)
          .json({
            success: false,

            message:
              "This booking hold has expired. Please create a new booking.",
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
              "Payment cannot be created for this booking status.",
          });
      }

      const amountInSubunits =
        toPaise(
          booking.priceDetails
            .grandTotal
        );

      if (
        amountInSubunits < 100
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "The booking amount is invalid for online payment.",
          });
      }

      /*
         Reuse an existing order to prevent
         duplicate Razorpay orders.
      */

      if (
        booking.payment
          ?.razorpayOrderId
      ) {
        booking.holdExpiresAt =
          createHoldExpiry();

        await booking.save();

        return res
          .status(200)
          .json({
            success: true,

            message:
              "Existing payment order returned.",

            reused: true,

            keyId:
              getRazorpayKeyId(),

            order: {
              id:
                booking.payment
                  .razorpayOrderId,

              amount:
                booking.payment
                  .amountInSubunits,

              currency:
                booking.payment
                  .currency,

              receipt:
                booking.bookingReference,
            },

            booking:
              serializePayment(
                booking
              ),
          });
      }

      const razorpay =
        getRazorpayClient();

      const order =
        await razorpay.orders.create({
          amount:
            amountInSubunits,

          currency: "INR",

          receipt:
            booking.bookingReference.slice(
              0,
              40
            ),

          partial_payment: false,

          notes: {
            bookingId:
              booking._id.toString(),

            bookingReference:
              booking.bookingReference,

            customerId:
              booking.customer.toString(),
          },
        });

      booking.payment.provider =
        "razorpay";

      booking.payment.currency =
        order.currency;

      booking.payment.amountInSubunits =
        order.amount;

      booking.payment.razorpayOrderId =
        order.id;

      booking.payment.orderStatus =
        order.status || "created";

      booking.payment.orderCreatedAt =
        new Date();

      booking.holdExpiresAt =
        createHoldExpiry();

      booking.payment.failureCode =
        "";

      booking.payment.failureDescription =
        "";

      await booking.save();

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Payment order created successfully.",

          reused: false,

          keyId:
            getRazorpayKeyId(),

          order: {
            id: order.id,
            amount: order.amount,
            currency:
              order.currency,
            receipt:
              order.receipt,
          },

          booking:
            serializePayment(
              booking
            ),
        });
    } catch (error) {
      console.error(
        "Create Razorpay order error:",
        error
      );

      return res
        .status(
          error.status || 500
        )
        .json({
          success: false,

          message:
            error.message ||
            "Unable to create the payment order.",
        });
    }
  };

/* =====================================
   Verify Razorpay payment

   POST /api/payments/verify
===================================== */

export const verifyRazorpayPayment =
  async (req, res) => {
    try {
      const {
        bookingId,

        razorpay_order_id:
          orderId,

        razorpay_payment_id:
          paymentId,

        razorpay_signature:
          signature,
      } = req.body;

      if (
        !isValidId(bookingId) ||
        !orderId ||
        !paymentId ||
        !signature
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Complete Razorpay payment verification details are required.",
          });
      }

      await Booking.expireStaleHolds();

      const booking =
        await Booking.findById(
          bookingId
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
        getUserId(req.user);

      if (
        !userId ||
        booking.customer.toString() !==
          userId.toString()
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot verify payment for this booking.",
          });
      }

      if (
        [
          "paid",
          "refund_pending",
          "partially_refunded",
          "refunded",
        ].includes(
          booking.paymentStatus
        ) &&
        booking.payment
          ?.razorpayPaymentId ===
          paymentId
      ) {
        return res
          .status(200)
          .json({
            success: true,

            requiresRefund:
              booking.paymentStatus ===
                "refund_pending" ||
              booking.bookingStatus ===
                "refund_pending",

            message:
              "Payment was already verified.",

            booking:
              await populateBooking(
                booking._id
              ),
          });
      }

      if (
        booking.payment
          ?.razorpayOrderId !==
        orderId
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "The Razorpay order does not belong to this booking.",
          });
      }

      if (
        !isRazorpayConfigured()
      ) {
        return res
          .status(503)
          .json({
            success: false,

            message:
              "Razorpay is not configured on the server.",
          });
      }

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env
              .RAZORPAY_KEY_SECRET
          )
          .update(
            `${booking.payment.razorpayOrderId}|${paymentId}`
          )
          .digest("hex");

      if (
        !safeSignatureEqual(
          expectedSignature,
          signature
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid Razorpay payment signature.",
          });
      }

      const razorpay =
        getRazorpayClient();

      const paymentEntity =
        await razorpay.payments.fetch(
          paymentId
        );

      const paymentResult =
        await markCapturedPayment({
          booking,
          paymentEntity,
          signature,
        });

      return res
        .status(200)
        .json({
          success: true,

          requiresRefund:
            paymentResult.requiresRefund,

          message:
            paymentResult.requiresRefund
              ? "Payment was captured after the booking hold expired. The booking was not confirmed and a refund is pending."
              : "Payment verified and booking confirmed successfully.",

          booking:
            await populateBooking(
              booking._id
            ),
        });
    } catch (error) {
      console.error(
        "Verify Razorpay payment error:",
        error
      );

      return res
        .status(
          error.status || 500
        )
        .json({
          success: false,

          message:
            error.message ||
            "Unable to verify the payment.",
        });
    }
  };

/* =====================================
   Record failed payment

   POST /api/payments/failure
===================================== */

export const recordPaymentFailure =
  async (req, res) => {
    try {
      const {
        bookingId,
        orderId,
        paymentId = "",

        error:
          paymentError = {},
      } = req.body;

      if (
        !isValidId(bookingId) ||
        !orderId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Booking ID and Razorpay order ID are required.",
          });
      }

      await Booking.expireStaleHolds();

      const booking =
        await Booking.findById(
          bookingId
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
        getUserId(req.user);

      if (
        !userId ||
        booking.customer.toString() !==
          userId.toString()
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot update payment for this booking.",
          });
      }

      if (
        booking.paymentStatus ===
        "paid"
      ) {
        return res
          .status(200)
          .json({
            success: true,

            message:
              "Payment is already completed.",
          });
      }

      if (
        booking.payment
          ?.razorpayOrderId !==
        orderId
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "The Razorpay order does not belong to this booking.",
          });
      }

      booking.paymentStatus =
        "failed";

      booking.payment.razorpayPaymentId =
        paymentId || undefined;

      booking.payment.orderStatus =
        "attempted";

      booking.payment.failureCode =
        String(
          paymentError.code || ""
        ).slice(0, 100);

      booking.payment.failureDescription =
        String(
          paymentError.description ||
            paymentError.reason ||
            "Payment failed."
        ).slice(0, 500);

      booking.payment.failedAt =
        new Date();

      await booking.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Payment failure recorded.",

          payment:
            serializePayment(
              booking
            ),
        });
    } catch (error) {
      console.error(
        "Record payment failure error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to record the payment failure.",
        });
    }
  };

/* =====================================
   Get booking payment status

   GET /api/payments/:bookingId
===================================== */

export const getPaymentStatus =
  async (req, res) => {
    try {
      const { bookingId } =
        req.params;

      if (!isValidId(bookingId)) {
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
          bookingId
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

      if (
        !canAccessPayment(
          booking,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot access this payment.",
          });
      }

      return res
        .status(200)
        .json({
          success: true,

          payment:
            serializePayment(
              booking
            ),
        });
    } catch (error) {
      console.error(
        "Get payment status error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load payment status.",
        });
    }
  };

/* =====================================
   Initiate Razorpay refund

   POST /api/payments/:bookingId/refund
===================================== */

export const initiateRazorpayRefund =
  async (req, res) => {
    try {
      const { bookingId } =
        req.params;

      const {
        amount,
        reason =
          "Booking cancellation refund",
      } = req.body;

      if (!isValidId(bookingId)) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid booking ID.",
          });
      }

      const booking =
        await Booking.findById(
          bookingId
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

      if (
        booking.paymentStatus !==
          "paid" &&
        booking.paymentStatus !==
          "partially_refunded" &&
        booking.paymentStatus !==
          "refund_pending"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Only captured payments can be refunded.",
          });
      }

      if (
        !booking.payment
          ?.razorpayPaymentId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Razorpay payment ID is missing from this booking.",
          });
      }

      const paidAmountPaise =
        toPaise(
          booking.priceDetails
            .grandTotal
        );

      const alreadyRefundedPaise =
        (
          booking.refunds || []
        )
          .filter((refund) => {
            return [
              "pending",
              "processed",
            ].includes(
              refund.status
            );
          })
          .reduce(
            (total, refund) => {
              return (
                total +
                refund.amountInSubunits
              );
            },
            0
          );

      const availablePaise =
        paidAmountPaise -
        alreadyRefundedPaise;

      const requestedPaise =
        amount !== undefined &&
        amount !== null &&
        amount !== ""
          ? toPaise(amount)
          : availablePaise;

      if (
        requestedPaise <= 0 ||
        requestedPaise >
          availablePaise
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Refund amount exceeds the remaining captured payment.",

            refundableAmount:
              availablePaise /
              100,
          });
      }

      const fullRefund =
        requestedPaise ===
        availablePaise;

      const receipt =
        `RF-${booking.bookingReference}-${requestedPaise}`.slice(
          0,
          40
        );

      const razorpay =
        getRazorpayClient();

      const refund =
        await razorpay.payments.refund(
          booking.payment
            .razorpayPaymentId,
          {
            amount:
              requestedPaise,

            speed: "normal",

            receipt,

            notes: {
              bookingId:
                booking._id.toString(),

              bookingReference:
                booking.bookingReference,

              reason:
                String(
                  reason
                ).slice(0, 250),
            },
          }
        );

      booking.refunds.push({
        razorpayRefundId:
          refund.id,

        amountInSubunits:
          refund.amount,

        currency:
          refund.currency ||
          "INR",

        status:
          refund.status ||
          "pending",

        speedRequested:
          refund.speed_requested ||
          "normal",

        speedProcessed:
          refund.speed_processed ||
          "",

        reason:
          String(reason).slice(
            0,
            500
          ),

        initiatedBy:
          req.user._id,

        initiatedAt:
          new Date(),

        processedAt:
          refund.status ===
          "processed"
            ? new Date()
            : null,
      });

      if (
        refund.status ===
        "processed"
      ) {
        booking.paymentStatus =
          fullRefund
            ? "refunded"
            : "partially_refunded";

        if (
          fullRefund &&
          [
            "cancelled",
            "refund_pending",
          ].includes(
            booking.bookingStatus
          )
        ) {
          booking.bookingStatus =
            "refunded";
        }
      } else {
        booking.paymentStatus =
          "refund_pending";

        if (
          fullRefund &&
          booking.bookingStatus ===
            "cancelled"
        ) {
          booking.bookingStatus =
            "refund_pending";
        }
      }

      booking.cancellation.refundAmount =
        (
          alreadyRefundedPaise +
          requestedPaise
        ) / 100;

      await booking.save();

      const populatedBooking =
        await populateBooking(
          booking._id
        );

      void sendRefundStatusEmail({
        booking:
          populatedBooking,

        refund: {
          razorpayRefundId:
            refund.id,

          amountInSubunits:
            refund.amount,
        },

        processed:
          refund.status ===
          "processed",
      });

      return res
        .status(200)
        .json({
          success: true,

          message:
            refund.status ===
            "processed"
              ? "Refund processed successfully."
              : "Refund initiated successfully.",

          refund,

          payment:
            serializePayment(
              booking
            ),
        });
    } catch (error) {
      console.error(
        "Initiate Razorpay refund error:",
        error
      );

      return res
        .status(
          error.status || 500
        )
        .json({
          success: false,

          message:
            error?.error
              ?.description ||
            error.message ||
            "Unable to initiate the refund.",
        });
    }
  };

/* =====================================
   Razorpay webhook

   POST /api/payments/webhook
===================================== */

export const handleRazorpayWebhook =
  async (req, res) => {
    try {
      const signature =
        req.headers[
          "x-razorpay-signature"
        ];

      const eventId =
        req.headers[
          "x-razorpay-event-id"
        ];

      const webhookSecret =
        process.env
          .RAZORPAY_WEBHOOK_SECRET;

      if (
        !webhookSecret ||
        !signature ||
        !Buffer.isBuffer(req.body)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid Razorpay webhook configuration or payload.",
          });
      }

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            webhookSecret
          )
          .update(req.body)
          .digest("hex");

      if (
        !safeSignatureEqual(
          expectedSignature,
          signature
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid Razorpay webhook signature.",
          });
      }

      const payload =
        JSON.parse(
          req.body.toString(
            "utf8"
          )
        );

      await Booking.expireStaleHolds();

      const eventName =
        payload.event;

      const paymentEntity =
        payload.payload?.payment
          ?.entity;

      const refundEntity =
        payload.payload?.refund
          ?.entity;

      let booking = null;

      let refundNotification =
        null;

      if (
        paymentEntity?.order_id
      ) {
        booking =
          await Booking.findOne({
            "payment.razorpayOrderId":
              paymentEntity.order_id,
          });
      } else if (
        refundEntity?.payment_id
      ) {
        booking =
          await Booking.findOne({
            "payment.razorpayPaymentId":
              refundEntity.payment_id,
          });
      }

      if (!booking) {
        return res
          .status(200)
          .json({
            success: true,
            ignored: true,
          });
      }

      if (
        eventId &&
        booking.payment
          .processedWebhookEventIds
          .includes(
            String(eventId)
          )
      ) {
        return res
          .status(200)
          .json({
            success: true,
            duplicate: true,
          });
      }

      if (
        eventName ===
          "payment.captured" &&
        paymentEntity
      ) {
        await markCapturedPayment({
          booking,
          paymentEntity,
        });
      } else if (
        eventName ===
          "payment.failed" &&
        paymentEntity &&
        booking.paymentStatus !==
          "paid"
      ) {
        booking.paymentStatus =
          "failed";

        booking.payment.razorpayPaymentId =
          paymentEntity.id ||
          undefined;

        booking.payment.orderStatus =
          "attempted";

        booking.payment.failureCode =
          String(
            paymentEntity.error_code ||
              ""
          ).slice(0, 100);

        booking.payment.failureDescription =
          String(
            paymentEntity.error_description ||
              "Payment failed."
          ).slice(0, 500);

        booking.payment.failedAt =
          new Date();
      } else if (refundEntity) {
        const storedRefund =
          booking.refunds.find(
            (refund) => {
              return (
                refund.razorpayRefundId ===
                refundEntity.id
              );
            }
          );

        if (storedRefund) {
          const previousRefundStatus =
            storedRefund.status;

          storedRefund.status =
            refundEntity.status;

          storedRefund.speedProcessed =
            refundEntity.speed_processed ||
            "";

          if (
            eventName ===
            "refund.processed"
          ) {
            storedRefund.processedAt =
              new Date();

            if (
              previousRefundStatus !==
              "processed"
            ) {
              refundNotification =
                {
                  refund: {
                    razorpayRefundId:
                      refundEntity.id,

                    amountInSubunits:
                      refundEntity.amount,
                  },

                  processed: true,
                };
            }
          }

          if (
            eventName ===
            "refund.failed"
          ) {
            storedRefund.failedAt =
              new Date();
          }

          const successfulRefundPaise =
            booking.refunds
              .filter(
                (refund) => {
                  return (
                    refund.status ===
                    "processed"
                  );
                }
              )
              .reduce(
                (
                  total,
                  refund
                ) => {
                  return (
                    total +
                    refund.amountInSubunits
                  );
                },
                0
              );

          const paidAmountPaise =
            toPaise(
              booking.priceDetails
                .grandTotal
            );

          if (
            successfulRefundPaise >=
            paidAmountPaise
          ) {
            booking.paymentStatus =
              "refunded";

            if (
              [
                "cancelled",
                "refund_pending",
              ].includes(
                booking.bookingStatus
              )
            ) {
              booking.bookingStatus =
                "refunded";
            }
          } else if (
            successfulRefundPaise >
            0
          ) {
            booking.paymentStatus =
              "partially_refunded";
          } else if (
            eventName ===
            "refund.failed"
          ) {
            booking.paymentStatus =
              "paid";
          }
        }
      }

      if (eventId) {
        booking.payment
          .processedWebhookEventIds
          .addToSet(
            String(eventId)
          );

        if (
          booking.payment
            .processedWebhookEventIds
            .length > 100
        ) {
          booking.payment.processedWebhookEventIds =
            booking.payment.processedWebhookEventIds.slice(
              -100
            );
        }
      }

      await booking.save();

      if (refundNotification) {
        const populatedBooking =
          await populateBooking(
            booking._id
          );

        void sendRefundStatusEmail(
          {
            booking:
              populatedBooking,

            ...refundNotification,
          }
        );
      }

      return res
        .status(200)
        .json({
          success: true,
        });
    } catch (error) {
      console.error(
        "Razorpay webhook error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to process the Razorpay webhook.",
        });
    }
  };