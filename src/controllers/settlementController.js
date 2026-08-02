import crypto from "crypto";
import mongoose from "mongoose";

import Booking from "../models/Booking.js";
import OwnerPayoutAccount from "../models/OwnerPayoutAccount.js";

import OwnerSettlement, {
  PAYOUT_MODES,
  SETTLEMENT_STATUSES,
} from "../models/OwnerSettlement.js";

const RAZORPAY_API_URL =
  "https://api.razorpay.com";

const PROVIDER_TIMEOUT_MS = 20000;

const MINIMUM_PAYOUT_IN_SUBUNITS =
  100;

const DEFAULT_PAGE_SIZE = 20;
const MAXIMUM_PAGE_SIZE = 100;

const MANAGED_SETTLEMENT_ROLES = [
  "finance_manager",
  "super_admin",
];

const ACTIVE_PAYOUT_STATUSES = [
  "queued",
  "pending",
  "processing",
];

const ELIGIBLE_PAYMENT_STATUSES = [
  "paid",
  "partially_refunded",
];

const payoutAccountInternalFields = [
  "+razorpay.fundAccountId",
].join(" ");

/* =====================================
   General helpers
===================================== */

const getUserId = (req) => {
  return (
    req.user?._id ||
    req.user?.id
  );
};

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(
    value,
  );
};

const normalizeText = (value) => {
  return String(value ?? "").trim();
};

const escapeRegExp = (value) => {
  return normalizeText(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
};

const isSettlementStaff = (user) => {
  return MANAGED_SETTLEMENT_ROLES.includes(
    user?.role,
  );
};

const toPositiveInteger = (
  value,
  fallbackValue,
) => {
  const number = Number.parseInt(
    value,
    10,
  );

  return (
    Number.isInteger(number) &&
    number > 0
      ? number
      : fallbackValue
  );
};

const getPagination = (
  query = {},
) => {
  const page = toPositiveInteger(
    query.page,
    1,
  );

  const limit = Math.min(
    toPositiveInteger(
      query.limit,
      DEFAULT_PAGE_SIZE,
    ),
    MAXIMUM_PAGE_SIZE,
  );

  return {
    page,
    limit,
    skip:
      (page - 1) *
      limit,
  };
};

const toSubunits = (amount) => {
  const numericAmount =
    Number(amount);

  if (
    !Number.isFinite(
      numericAmount,
    ) ||
    numericAmount <= 0
  ) {
    return 0;
  }

  return Math.max(
    Math.round(
      numericAmount * 100,
    ),
    0,
  );
};

const parseIntegerAmount = (
  value,
  fallbackValue = 0,
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallbackValue;
  }

  const amount = Number(value);

  return Number.isInteger(amount)
    ? amount
    : null;
};

const parseDate = (
  value,
  endOfDay = false,
) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  if (
    endOfDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(value),
    )
  ) {
    date.setHours(
      23,
      59,
      59,
      999,
    );
  }

  return date;
};

const getDateFilter = ({
  dateFrom,
  dateTo,
}) => {
  const from =
    parseDate(dateFrom);

  const to =
    parseDate(
      dateTo,
      true,
    );

  if (
    dateFrom &&
    !from
  ) {
    return {
      error:
        "Please provide a valid start date.",
    };
  }

  if (
    dateTo &&
    !to
  ) {
    return {
      error:
        "Please provide a valid end date.",
    };
  }

  if (
    from &&
    to &&
    to < from
  ) {
    return {
      error:
        "The end date must be on or after the start date.",
    };
  }

  const filter = {};

  if (from) {
    filter.$gte = from;
  }

  if (to) {
    filter.$lte = to;
  }

  return {
    filter,
  };
};

const getDefaultCommissionRate =
  () => {
    const configuredRate =
      Number(
        process.env
          .PLATFORM_COMMISSION_RATE,
      );

    if (
      Number.isFinite(
        configuredRate,
      ) &&
      configuredRate >= 0 &&
      configuredRate <= 100
    ) {
      return configuredRate;
    }

    return 15;
  };

const parseCommissionRate = (
  value,
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return getDefaultCommissionRate();
  }

  const commissionRate =
    Number(value);

  if (
    !Number.isFinite(
      commissionRate,
    ) ||
    commissionRate < 0 ||
    commissionRate > 100
  ) {
    return null;
  }

  return commissionRate;
};

const getProcessedRefundAmount = (
  booking,
) => {
  return (
    booking.refunds || []
  ).reduce(
    (
      total,
      refund,
    ) => {
      if (
        refund.status !==
        "processed"
      ) {
        return total;
      }

      return (
        total +
        Math.max(
          Number(
            refund.amountInSubunits ||
              0,
          ),
          0,
        )
      );
    },
    0,
  );
};

const hasPendingRefund = (
  booking,
) => {
  return (
    booking.paymentStatus ===
      "refund_pending" ||
    (
      booking.refunds ||
      []
    ).some(
      (refund) =>
        refund.status ===
        "pending",
    )
  );
};

const getBookingGrossAmount = (
  booking,
) => {
  const capturedAmount =
    Number(
      booking.payment
        ?.amountInSubunits ||
        0,
    );

  if (
    Number.isInteger(
      capturedAmount,
    ) &&
    capturedAmount > 0
  ) {
    return capturedAmount;
  }

  return toSubunits(
    booking.priceDetails
      ?.grandTotal,
  );
};

const calculateBookingEntry = (
  booking,
  commissionRate,
) => {
  const grossAmountInSubunits =
    getBookingGrossAmount(
      booking,
    );

  const refundedAmountInSubunits =
    Math.min(
      getProcessedRefundAmount(
        booking,
      ),
      grossAmountInSubunits,
    );

  const amountRemainingAfterRefund =
    Math.max(
      grossAmountInSubunits -
        refundedAmountInSubunits,
      0,
    );

  /*
   * Commission is calculated only on
   * accommodation revenue.
   *
   * Service fees and taxes are not
   * included in owner earnings.
   */

  const accommodationAmountInSubunits =
    Math.max(
      toSubunits(
        booking.priceDetails
          ?.roomTotal,
      ) -
        toSubunits(
          booking.priceDetails
            ?.discount,
        ),
      0,
    );

  const accommodationAfterRefund =
    Math.max(
      accommodationAmountInSubunits -
        refundedAmountInSubunits,
      0,
    );

  const commissionableAmountInSubunits =
    Math.min(
      accommodationAfterRefund,
      amountRemainingAfterRefund,
    );

  const platformCommissionInSubunits =
    Math.round(
      commissionableAmountInSubunits *
        (commissionRate /
          100),
    );

  const ownerEarningsInSubunits =
    Math.max(
      commissionableAmountInSubunits -
        platformCommissionInSubunits,
      0,
    );

  return {
    booking:
      booking._id,

    property:
      booking.property?._id ||
      booking.property,

    bookingReference:
      booking.bookingReference,

    completedAt:
      booking.completedAt,

    grossAmountInSubunits,

    refundedAmountInSubunits,

    commissionableAmountInSubunits,

    platformCommissionRate:
      commissionRate,

    platformCommissionInSubunits,

    ownerEarningsInSubunits,

    currency: "INR",
  };
};

const getPayoutMode = (
  requestedMode,
  payoutAccount,
) => {
  if (
    payoutAccount.payoutMethod ===
    "upi"
  ) {
    const mode =
      normalizeText(
        requestedMode ||
          "UPI",
      ).toUpperCase();

    return mode === "UPI"
      ? "UPI"
      : null;
  }

  const mode =
    normalizeText(
      requestedMode ||
        "IMPS",
    ).toUpperCase();

  return [
    "NEFT",
    "RTGS",
    "IMPS",
  ].includes(mode)
    ? mode
    : null;
};

const createPayoutAccountSnapshot =
  (payoutAccount) => {
    if (
      payoutAccount.payoutMethod ===
      "upi"
    ) {
      return {
        payoutMethod:
          "upi",

        accountHolderName:
          "",

        maskedDestination:
          payoutAccount
            .upiDetails
            ?.maskedVpa ||
          "Masked UPI ID",

        bankName: "",

        ifsc: "",
      };
    }

    const lastFourDigits =
      payoutAccount.bankDetails
        ?.accountNumberLast4 ||
      "";

    return {
      payoutMethod:
        "bank_account",

      accountHolderName:
        payoutAccount
          .bankDetails
          ?.accountHolderName ||
        "",

      maskedDestination:
        lastFourDigits
          ? `••••••••${lastFourDigits}`
          : "Masked bank account",

      bankName:
        payoutAccount
          .bankDetails
          ?.bankName ||
        "",

      ifsc:
        payoutAccount
          .bankDetails
          ?.ifsc ||
        "",
    };
  };

const normalizeAdjustments = (
  adjustments,
  addedBy,
) => {
  if (
    adjustments ===
      undefined ||
    adjustments === null
  ) {
    return {
      adjustments: [],
    };
  }

  if (
    !Array.isArray(
      adjustments,
    )
  ) {
    return {
      error:
        "Settlement adjustments must be provided as an array.",
    };
  }

  const normalizedAdjustments =
    [];

  for (
    const adjustment of
    adjustments
  ) {
    const description =
      normalizeText(
        adjustment
          ?.description,
      );

    const amountInSubunits =
      parseIntegerAmount(
        adjustment
          ?.amountInSubunits,
        null,
      );

    if (!description) {
      return {
        error:
          "Every settlement adjustment requires a description.",
      };
    }

    if (
      amountInSubunits ===
      null
    ) {
      return {
        error:
          "Adjustment amounts must be integer values in paise.",
      };
    }

    normalizedAdjustments.push(
      {
        description,

        amountInSubunits,

        addedBy,

        addedAt:
          new Date(),
      },
    );
  }

  return {
    adjustments:
      normalizedAdjustments,
  };
};

const serializeSettlement = (
  settlement,
) => {
  if (!settlement) {
    return null;
  }

  const result =
    typeof settlement.toObject ===
    "function"
      ? settlement.toObject({
          virtuals: true,
        })
      : structuredClone(
          settlement,
        );

  if (result.payout) {
    delete result.payout
      .idempotencyKey;
  }

  return result;
};

const createPaginationResponse = ({
  page,
  limit,
  total,
}) => {
  const totalPages =
    total === 0
      ? 0
      : Math.ceil(
          total / limit,
        );

  return {
    currentPage: page,

    totalPages,

    totalSettlements:
      total,

    pageSize: limit,

    hasNextPage:
      page < totalPages,

    hasPreviousPage:
      page > 1,
  };
};

const addSettlementHistory = ({
  settlement,
  action,
  note = "",
  changedBy = null,
  source = "admin",
}) => {
  settlement.addHistory({
    action,

    status:
      settlement.status,

    note:
      normalizeText(note),

    changedBy,

    source,
  });
};

const sendControllerError = ({
  res,
  error,
  operation,
  fallbackMessage,
}) => {
  console.error(
    `${operation}:`,
    error,
  );

  if (
    error.name ===
    "ValidationError"
  ) {
    const firstValidationError =
      Object.values(
        error.errors ||
          {},
      )[0];

    return res
      .status(400)
      .json({
        success: false,

        message:
          firstValidationError
            ?.message ||
          "Settlement validation failed.",
      });
  }

  if (
    error.name ===
    "CastError"
  ) {
    return res
      .status(400)
      .json({
        success: false,

        message:
          "Invalid settlement information.",
      });
  }

  if (
    error.code ===
    11000
  ) {
    return res
      .status(409)
      .json({
        success: false,

        message:
          "One or more selected bookings already belong to another settlement.",
      });
  }

  return res
    .status(
      error.status ||
        500,
    )
    .json({
      success: false,

      message:
        error.exposeMessage
          ? error.message
          : fallbackMessage,
    });
};

/* =====================================
   Razorpay helpers
===================================== */

const getProviderCredentials =
  () => {
    return {
      keyId:
        process.env
          .RAZORPAYX_KEY_ID ||
        process.env
          .RAZORPAY_KEY_ID ||
        "",

      keySecret:
        process.env
          .RAZORPAYX_KEY_SECRET ||
        process.env
          .RAZORPAY_KEY_SECRET ||
        "",
    };
  };

const getRazorpaySourceAccountNumber =
  () => {
    return normalizeText(
      process.env
        .RAZORPAYX_ACCOUNT_NUMBER,
    );
  };

const getProviderErrorMessage = (
  data,
  fallbackMessage,
) => {
  return (
    data?.error
      ?.description ||
    data?.error?.reason ||
    data?.message ||
    fallbackMessage
  );
};

const razorpayRequest = async ({
  method,
  path,
  body,
  idempotencyKey,
}) => {
  const {
    keyId,
    keySecret,
  } =
    getProviderCredentials();

  if (
    !keyId ||
    !keySecret
  ) {
    const configurationError =
      new Error(
        "RazorpayX credentials are not configured.",
      );

    configurationError.status =
      503;

    configurationError.exposeMessage =
      true;

    configurationError.isProviderError =
      true;

    configurationError.isAmbiguous =
      false;

    throw configurationError;
  }

  const authorization =
    Buffer.from(
      `${keyId}:${keySecret}`,
    ).toString("base64");

  const headers = {
    Authorization:
      `Basic ${authorization}`,
  };

  if (
    body !== undefined
  ) {
    headers[
      "Content-Type"
    ] = "application/json";
  }

  if (idempotencyKey) {
    headers[
      "X-Payout-Idempotency"
    ] = idempotencyKey;
  }

  const abortController =
    new AbortController();

  const timeoutId =
    setTimeout(() => {
      abortController.abort();
    }, PROVIDER_TIMEOUT_MS);

  try {
    const response =
      await fetch(
        `${RAZORPAY_API_URL}${path}`,
        {
          method,

          headers,

          ...(body !==
          undefined
            ? {
                body:
                  JSON.stringify(
                    body,
                  ),
              }
            : {}),

          signal:
            abortController.signal,
        },
      );

    const data =
      await response
        .json()
        .catch(
          () => null,
        );

    if (!response.ok) {
      const providerError =
        new Error(
          getProviderErrorMessage(
            data,
            "Razorpay could not process the settlement request.",
          ),
        );

      providerError.status =
        response.status;

      providerError.providerData =
        data;

      providerError.isProviderError =
        true;

      providerError.isAmbiguous =
        response.status >=
        500;

      throw providerError;
    }

    return data;
  } catch (error) {
    if (
      error.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Razorpay did not respond within the permitted time.",
        );

      timeoutError.status =
        504;

      timeoutError.isProviderError =
        true;

      timeoutError.isAmbiguous =
        true;

      throw timeoutError;
    }

    if (
      error.isProviderError
    ) {
      throw error;
    }

    const networkError =
      new Error(
        "Unable to connect to Razorpay. The payout result is currently unknown.",
      );

    networkError.status =
      502;

    networkError.isProviderError =
      true;

    networkError.isAmbiguous =
      true;

    throw networkError;
  } finally {
    clearTimeout(
      timeoutId,
    );
  }
};

const mapProviderStatus = (
  providerStatus,
) => {
  const normalizedStatus =
    normalizeText(
      providerStatus,
    ).toLowerCase();

  const statusMap = {
    queued: "queued",

    pending: "pending",

    processing:
      "processing",

    processed:
      "processed",

    failed: "failed",

    rejected:
      "rejected",

    cancelled:
      "cancelled",

    reversed:
      "reversed",
  };

  return (
    statusMap[
      normalizedStatus
    ] ||
    "pending"
  );
};

const dateFromUnixTime = (
  value,
) => {
  const timestamp =
    Number(value);

  if (
    !Number.isFinite(
      timestamp,
    ) ||
    timestamp <= 0
  ) {
    return null;
  }

  return new Date(
    timestamp * 1000,
  );
};

const applyProviderPayout = ({
  settlement,
  payoutData,
  changedBy = null,
}) => {
  const previousStatus =
    settlement.status;

  const nextStatus =
    mapProviderStatus(
      payoutData?.status,
    );

  const now =
    new Date();

  settlement.status =
    nextStatus;

  settlement.payout.provider =
    "razorpayx";

  settlement.payout.razorpayPayoutId =
    payoutData?.id ||
    settlement.payout
      .razorpayPayoutId;

  settlement.payout.providerStatus =
    nextStatus;

  settlement.payout.utr =
    normalizeText(
      payoutData?.utr,
    );

  settlement.payout.feesInSubunits =
    Math.max(
      Number(
        payoutData?.fees ||
          0,
      ),
      0,
    );

  settlement.payout.taxInSubunits =
    Math.max(
      Number(
        payoutData?.tax ||
          0,
      ),
      0,
    );

  settlement.payout.lastProviderSyncAt =
    now;

  settlement.payout.statusDetails =
    {
      source:
        normalizeText(
          payoutData
            ?.status_details
            ?.source,
        ),

      reason:
        normalizeText(
          payoutData
            ?.status_details
            ?.reason,
        ),

      description:
        normalizeText(
          payoutData
            ?.status_details
            ?.description,
        ),
    };

  const providerFailureReason =
    normalizeText(
      payoutData
        ?.failure_reason,
    ) ||
    normalizeText(
      payoutData
        ?.status_details
        ?.description,
    );

  const providerFailureCode =
    normalizeText(
      payoutData
        ?.failure_code,
    ) ||
    normalizeText(
      payoutData
        ?.status_details
        ?.reason,
    );

  if (
    [
      "failed",
      "rejected",
    ].includes(nextStatus)
  ) {
    settlement.payout.failureCode =
      providerFailureCode;

    settlement.payout.failureReason =
      providerFailureReason;

    settlement.payout.failedAt =
      now;
  } else {
    settlement.payout.failureCode =
      "";

    settlement.payout.failureReason =
      "";

    settlement.payout.failedAt =
      null;
  }

  if (
    nextStatus ===
    "processed"
  ) {
    settlement.payout.processedAt =
      dateFromUnixTime(
        payoutData
          ?.processed_at,
      ) || now;
  }

  if (
    nextStatus ===
    "reversed"
  ) {
    settlement.payout.reversedAt =
      now;
  }

  if (
    !settlement.payout
      .initiatedAt
  ) {
    settlement.payout.initiatedAt =
      dateFromUnixTime(
        payoutData
          ?.created_at,
      ) || now;
  }

  if (
    previousStatus !==
    nextStatus
  ) {
    addSettlementHistory({
      settlement,

      action:
        `payout_${nextStatus}`,

      note:
        providerFailureReason ||
        `Razorpay payout status changed to ${nextStatus}.`,

      changedBy,

      source:
        "razorpay",
    });
  }
};

const getVerifiedPayoutAccount =
  async ({
    ownerId,
    payoutAccountId,
  }) => {
    const payoutAccount =
      await OwnerPayoutAccount.findOne(
        {
          _id:
            payoutAccountId,

          owner:
            ownerId,
        },
      ).select(
        payoutAccountInternalFields,
      );

    if (!payoutAccount) {
      return {
        error:
          "The payout account connected to this settlement was not found.",

        status: 404,
      };
    }

    if (
      payoutAccount
        .verificationStatus !==
        "verified" ||
      !payoutAccount
        .payoutsEnabled
    ) {
      return {
        error:
          "The owner's payout account is not verified or is currently disabled.",

        status: 409,
      };
    }

    if (
      !payoutAccount
        .razorpay
        ?.fundAccountId
    ) {
      return {
        error:
          "The verified payout account has no Razorpay fund account ID.",

        status: 409,
      };
    }

    return {
      payoutAccount,
    };
  };

/* =====================================
   Get eligible completed bookings
===================================== */

export const getEligibleSettlementBookings =
  async (req, res) => {
    try {
      const {
        ownerId,
        dateFrom,
        dateTo,
      } = req.query;

      if (
        ownerId &&
        !isValidObjectId(
          ownerId,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid owner ID.",
          });
      }

      const {
        filter:
          completedAtFilter,

        error:
          dateError,
      } = getDateFilter({
        dateFrom,
        dateTo,
      });

      if (dateError) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              dateError,
          });
      }

      const settledBookingIds =
        await OwnerSettlement.distinct(
          "bookingEntries.booking",
        );

      const filter = {
        bookingStatus:
          "completed",

        paymentStatus: {
          $in:
            ELIGIBLE_PAYMENT_STATUSES,
        },

        completedAt: {
          $ne: null,

          ...completedAtFilter,
        },

        refunds: {
          $not: {
            $elemMatch: {
              status:
                "pending",
            },
          },
        },

        ...(settledBookingIds.length >
        0
          ? {
              _id: {
                $nin:
                  settledBookingIds,
              },
            }
          : {}),

        ...(ownerId
          ? {
              owner:
                ownerId,
            }
          : {}),
      };

      const bookings =
        await Booking.find(
          filter,
        )
          .select(
            [
              "bookingReference",
              "owner",
              "property",
              "completedAt",
              "paymentStatus",
              "priceDetails",
              "payment.amountInSubunits",
              "refunds.amountInSubunits",
              "refunds.status",
            ].join(" "),
          )
          .populate(
            "owner",
            "fullName email phone role",
          )
          .populate(
            "property",
            "title propertyType location",
          )
          .sort({
            completedAt: 1,
            createdAt: 1,
          })
          .limit(500);

      const commissionRate =
        getDefaultCommissionRate();

      const eligibleBookings =
        bookings.map(
          (booking) => {
            const settlementEntry =
              calculateBookingEntry(
                booking,
                commissionRate,
              );

            return {
              _id:
                booking._id,

              bookingReference:
                booking.bookingReference,

              owner:
                booking.owner,

              property:
                booking.property,

              completedAt:
                booking.completedAt,

              paymentStatus:
                booking.paymentStatus,

              priceDetails:
                booking.priceDetails,

              settlementPreview:
                {
                  grossAmountInSubunits:
                    settlementEntry
                      .grossAmountInSubunits,

                  refundedAmountInSubunits:
                    settlementEntry
                      .refundedAmountInSubunits,

                  commissionableAmountInSubunits:
                    settlementEntry
                      .commissionableAmountInSubunits,

                  platformCommissionRate:
                    commissionRate,

                  platformCommissionInSubunits:
                    settlementEntry
                      .platformCommissionInSubunits,

                  ownerEarningsInSubunits:
                    settlementEntry
                      .ownerEarningsInSubunits,

                  currency:
                    "INR",
                },
            };
          },
        );

      return res
        .status(200)
        .json({
          success: true,

          count:
            eligibleBookings.length,

          defaultCommissionRate:
            commissionRate,

          bookings:
            eligibleBookings,
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Get eligible settlement bookings error",

          fallbackMessage:
            "Unable to load eligible settlement bookings.",
        },
      );
    }
  };

/* =====================================
   Create settlement draft
===================================== */

export const createSettlement =
  async (req, res) => {
    try {
      const creatorId =
        getUserId(req);

      const ownerId =
        normalizeText(
          req.body.ownerId,
        );

      const bookingIds =
        Array.isArray(
          req.body
            .bookingIds,
        )
          ? req.body.bookingIds.map(
              (
                bookingId,
              ) =>
                normalizeText(
                  bookingId,
                ),
            )
          : [];

      if (
        !isValidObjectId(
          ownerId,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "A valid owner ID is required.",
          });
      }

      if (
        bookingIds.length ===
        0
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Select at least one completed booking.",
          });
      }

      if (
        bookingIds.some(
          (bookingId) =>
            !isValidObjectId(
              bookingId,
            ),
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "One or more booking IDs are invalid.",
          });
      }

      if (
        new Set(
          bookingIds,
        ).size !==
        bookingIds.length
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "A booking cannot be selected more than once.",
          });
      }

      const commissionRate =
        parseCommissionRate(
          req.body
            .commissionRate,
        );

      if (
        commissionRate ===
        null
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Commission rate must be between 0 and 100.",
          });
      }

      const withholdingTaxInSubunits =
        parseIntegerAmount(
          req.body
            .withholdingTaxInSubunits,
          0,
        );

      if (
        withholdingTaxInSubunits ===
          null ||
        withholdingTaxInSubunits <
          0
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Withholding tax must be a non-negative integer in paise.",
          });
      }

      const {
        adjustments,

        error:
          adjustmentError,
      } =
        normalizeAdjustments(
          req.body
            .adjustments,
          creatorId,
        );

      if (
        adjustmentError
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              adjustmentError,
          });
      }

      const payoutAccount =
        await OwnerPayoutAccount.findOne(
          {
            owner:
              ownerId,

            verificationStatus:
              "verified",

            payoutsEnabled:
              true,

            isPrimary:
              true,
          },
        ).select(
          payoutAccountInternalFields,
        );

      if (
        !payoutAccount
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "This owner does not have a verified primary payout account.",
          });
      }

      if (
        !payoutAccount
          .razorpay
          ?.fundAccountId
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "The owner's payout account is not connected to a Razorpay fund account.",
          });
      }

      const payoutMode =
        getPayoutMode(
          req.body
            .payoutMode,
          payoutAccount,
        );

      if (
        !payoutMode ||
        !PAYOUT_MODES.includes(
          payoutMode,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              payoutAccount
                .payoutMethod ===
              "upi"
                ? "UPI payout accounts must use UPI payout mode."
                : "Bank payout mode must be NEFT, RTGS or IMPS.",
          });
      }

      const existingSettlement =
        await OwnerSettlement.findOne(
          {
            "bookingEntries.booking":
              {
                $in:
                  bookingIds,
              },
          },
        ).select(
          "settlementReference bookingEntries.booking",
        );

      if (
        existingSettlement
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              `One or more bookings already belong to settlement ${existingSettlement.settlementReference}.`,
          });
      }

      const bookings =
        await Booking.find(
          {
            _id: {
              $in:
                bookingIds,
            },

            owner:
              ownerId,

            bookingStatus:
              "completed",

            paymentStatus: {
              $in:
                ELIGIBLE_PAYMENT_STATUSES,
            },

            completedAt: {
              $ne: null,
            },
          },
        ).select(
          [
            "bookingReference",
            "owner",
            "property",
            "completedAt",
            "bookingStatus",
            "paymentStatus",
            "priceDetails",
            "payment.amountInSubunits",
            "payment.currency",
            "refunds.amountInSubunits",
            "refunds.status",
          ].join(" "),
        );

      if (
        bookings.length !==
        bookingIds.length
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Every selected booking must belong to this owner, be completed and have a captured payment.",
          });
      }

      if (
        bookings.some(
          hasPendingRefund,
        )
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "A selected booking has a pending refund. Complete the refund before creating its settlement.",
          });
      }

      const unsupportedCurrencyBooking =
        bookings.find(
          (booking) => {
            const currency =
              normalizeText(
                booking
                  .payment
                  ?.currency ||
                  "INR",
              );

            return (
              currency.toUpperCase() !==
              "INR"
            );
          },
        );

      if (
        unsupportedCurrencyBooking
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Only INR bookings can be included in an owner settlement.",
          });
      }

      const bookingEntries =
        bookings.map(
          (booking) =>
            calculateBookingEntry(
              booking,
              commissionRate,
            ),
        );

      const completionTimes =
        bookings.map(
          (booking) =>
            new Date(
              booking.completedAt,
            ).getTime(),
        );

      const settlement =
        new OwnerSettlement({
          owner:
            ownerId,

          payoutAccount:
            payoutAccount._id,

          payoutAccountSnapshot:
            createPayoutAccountSnapshot(
              payoutAccount,
            ),

          periodStart:
            new Date(
              Math.min(
                ...completionTimes,
              ),
            ),

          periodEnd:
            new Date(
              Math.max(
                ...completionTimes,
              ),
            ),

          bookingEntries,

          adjustments,

          totals: {
            withholdingTaxInSubunits,
          },

          currency:
            "INR",

          status:
            "draft",

          payoutMode,

          notes:
            normalizeText(
              req.body.notes,
            ),

          createdBy:
            creatorId,
        });

      settlement.recalculateTotals();

      addSettlementHistory(
        {
          settlement,

          action:
            "created",

          note:
            "Settlement draft created.",

          changedBy:
            creatorId,

          source:
            "admin",
        },
      );

      await settlement.save();

      await settlement.populate(
        [
          {
            path:
              "owner",

            select:
              "fullName email phone role",
          },

          {
            path:
              "bookingEntries.property",

            select:
              "title propertyType location",
          },
        ],
      );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Settlement draft created successfully.",

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Create settlement error",

          fallbackMessage:
            "Unable to create the owner settlement.",
        },
      );
    }
  };

/* =====================================
   Get owner's settlements
===================================== */

export const getMySettlements =
  async (req, res) => {
    try {
      const ownerId =
        getUserId(req);

      const {
        status,
      } = req.query;

      if (
        status &&
        !SETTLEMENT_STATUSES.includes(
          status,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement status filter.",
          });
      }

      const {
        page,
        limit,
        skip,
      } = getPagination(
        req.query,
      );

      const filter = {
        owner:
          ownerId,

        ...(status
          ? {
              status,
            }
          : {}),
      };

      const [
        settlements,
        total,
      ] =
        await Promise.all([
          OwnerSettlement.find(
            filter,
          )
            .populate(
              "bookingEntries.property",
              "title propertyType location",
            )
            .sort({
              createdAt:
                -1,
            })
            .skip(skip)
            .limit(
              limit,
            ),

          OwnerSettlement.countDocuments(
            filter,
          ),
        ]);

      return res
        .status(200)
        .json({
          success: true,

          count:
            settlements.length,

          settlements:
            settlements.map(
              serializeSettlement,
            ),

          pagination:
            createPaginationResponse(
              {
                page,
                limit,
                total,
              },
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Get owner settlements error",

          fallbackMessage:
            "Unable to load your settlements.",
        },
      );
    }
  };

/* =====================================
   Get managed settlements
===================================== */

export const getManagedSettlements =
  async (req, res) => {
    try {
      const {
        status,
        ownerId,
        search,
        dateFrom,
        dateTo,
      } = req.query;

      if (
        status &&
        !SETTLEMENT_STATUSES.includes(
          status,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement status filter.",
          });
      }

      if (
        ownerId &&
        !isValidObjectId(
          ownerId,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid owner ID.",
          });
      }

      const {
        filter:
          createdAtFilter,

        error:
          dateError,
      } = getDateFilter({
        dateFrom,
        dateTo,
      });

      if (dateError) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              dateError,
          });
      }

      const {
        page,
        limit,
        skip,
      } = getPagination(
        req.query,
      );

      const filter = {
        ...(status
          ? {
              status,
            }
          : {}),

        ...(ownerId
          ? {
              owner:
                ownerId,
            }
          : {}),

        ...(Object.keys(
          createdAtFilter,
        ).length > 0
          ? {
              createdAt:
                createdAtFilter,
            }
          : {}),

        ...(normalizeText(
          search,
        )
          ? {
              settlementReference:
                {
                  $regex:
                    escapeRegExp(
                      search,
                    ),

                  $options:
                    "i",
                },
            }
          : {}),
      };

      const [
        settlements,
        total,
      ] =
        await Promise.all([
          OwnerSettlement.find(
            filter,
          )
            .populate(
              "owner",
              "fullName email phone role",
            )
            .sort({
              createdAt:
                -1,
            })
            .skip(skip)
            .limit(
              limit,
            ),

          OwnerSettlement.countDocuments(
            filter,
          ),
        ]);

      return res
        .status(200)
        .json({
          success: true,

          count:
            settlements.length,

          settlements:
            settlements.map(
              serializeSettlement,
            ),

          pagination:
            createPaginationResponse(
              {
                page,
                limit,
                total,
              },
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Get managed settlements error",

          fallbackMessage:
            "Unable to load owner settlements.",
        },
      );
    }
  };

/* =====================================
   Get individual settlement
===================================== */

export const getSettlementById =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(
          id,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement ID.",
          });
      }

      const filter = {
        _id: id,

        ...(!isSettlementStaff(
          req.user,
        )
          ? {
              owner:
                getUserId(
                  req,
                ),
            }
          : {}),
      };

      const settlement =
        await OwnerSettlement.findOne(
          filter,
        )
          .populate(
            "owner",
            "fullName email phone role",
          )
          .populate(
            "bookingEntries.booking",
            "bookingReference checkInDate checkOutDate bookingStatus paymentStatus",
          )
          .populate(
            "bookingEntries.property",
            "title propertyType location",
          )
          .populate(
            "approval.approvedBy",
            "fullName email role",
          )
          .populate(
            "approval.rejectedBy",
            "fullName email role",
          )
          .populate(
            "createdBy",
            "fullName email role",
          )
          .populate(
            "history.changedBy",
            "fullName email role",
          );

      if (
        !settlement
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Settlement not found.",
          });
      }

      return res
        .status(200)
        .json({
          success: true,

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Get settlement error",

          fallbackMessage:
            "Unable to load the settlement.",
        },
      );
    }
  };

/* =====================================
   Submit settlement for approval
===================================== */

export const submitSettlementForApproval =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const changedBy =
        getUserId(req);

      if (
        !isValidObjectId(
          id,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement ID.",
          });
      }

      const settlement =
        await OwnerSettlement.findById(
          id,
        );

      if (
        !settlement
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Settlement not found.",
          });
      }

      if (
        settlement.status !==
        "draft"
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Only a draft settlement can be submitted for approval.",
          });
      }

      settlement.recalculateTotals();

      if (
        settlement
          .totals
          .netPayoutInSubunits <
        MINIMUM_PAYOUT_IN_SUBUNITS
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "The settlement net payout must be at least one rupee.",
          });
      }

      settlement.status =
        "pending_approval";

      settlement.approval.requestedAt =
        new Date();

      settlement.approval.rejectedAt =
        null;

      settlement.approval.rejectedBy =
        null;

      settlement.approval.rejectionReason =
        "";

      addSettlementHistory(
        {
          settlement,

          action:
            "submitted_for_approval",

          note:
            normalizeText(
              req.body
                .note,
            ) ||
            "Settlement submitted for approval.",

          changedBy,

          source:
            "admin",
        },
      );

      await settlement.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Settlement submitted for approval.",

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Submit settlement error",

          fallbackMessage:
            "Unable to submit the settlement for approval.",
        },
      );
    }
  };

/* =====================================
   Approve settlement
===================================== */

export const approveSettlement =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const approverId =
        getUserId(req);

      if (
        !isValidObjectId(
          id,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement ID.",
          });
      }

      const settlement =
        await OwnerSettlement.findById(
          id,
        );

      if (
        !settlement
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Settlement not found.",
          });
      }

      if (
        settlement.status !==
        "pending_approval"
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Only a settlement waiting for approval can be approved.",
          });
      }

      settlement.recalculateTotals();

      if (
        settlement
          .totals
          .netPayoutInSubunits <
        MINIMUM_PAYOUT_IN_SUBUNITS
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "The settlement net payout must be at least one rupee.",
          });
      }

      const payoutAccountResult =
        await getVerifiedPayoutAccount(
          {
            ownerId:
              settlement.owner,

            payoutAccountId:
              settlement.payoutAccount,
          },
        );

      if (
        payoutAccountResult.error
      ) {
        return res
          .status(
            payoutAccountResult.status,
          )
          .json({
            success:
              false,

            message:
              payoutAccountResult.error,
          });
      }

      settlement.status =
        "approved";

      settlement.approval.approvedAt =
        new Date();

      settlement.approval.approvedBy =
        approverId;

      settlement.approval.rejectedAt =
        null;

      settlement.approval.rejectedBy =
        null;

      settlement.approval.rejectionReason =
        "";

      addSettlementHistory(
        {
          settlement,

          action:
            "approved",

          note:
            normalizeText(
              req.body
                .note,
            ) ||
            "Settlement approved for payout.",

          changedBy:
            approverId,

          source:
            "admin",
        },
      );

      await settlement.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Settlement approved successfully.",

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Approve settlement error",

          fallbackMessage:
            "Unable to approve the settlement.",
        },
      );
    }
  };

/* =====================================
   Reject settlement
===================================== */

export const rejectSettlement =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const reviewerId =
        getUserId(req);

      const reason =
        normalizeText(
          req.body.reason,
        );

      if (
        !isValidObjectId(
          id,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement ID.",
          });
      }

      if (!reason) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "A rejection reason is required.",
          });
      }

      const settlement =
        await OwnerSettlement.findById(
          id,
        );

      if (
        !settlement
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Settlement not found.",
          });
      }

      if (
        settlement.status !==
        "pending_approval"
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Only a settlement waiting for approval can be rejected.",
          });
      }

      settlement.status =
        "rejected";

      settlement.approval.rejectedAt =
        new Date();

      settlement.approval.rejectedBy =
        reviewerId;

      settlement.approval.rejectionReason =
        reason;

      settlement.approval.approvedAt =
        null;

      settlement.approval.approvedBy =
        null;

      addSettlementHistory(
        {
          settlement,

          action:
            "rejected",

          note:
            reason,

          changedBy:
            reviewerId,

          source:
            "admin",
        },
      );

      await settlement.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Settlement rejected.",

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Reject settlement error",

          fallbackMessage:
            "Unable to reject the settlement.",
        },
      );
    }
  };

/* =====================================
   Cancel settlement
===================================== */

export const cancelSettlement =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const changedBy =
        getUserId(req);

      const reason =
        normalizeText(
          req.body.reason,
        );

      if (
        !isValidObjectId(
          id,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement ID.",
          });
      }

      if (!reason) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "A cancellation reason is required.",
          });
      }

      const settlement =
        await OwnerSettlement.findById(
          id,
        );

      if (
        !settlement
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Settlement not found.",
          });
      }

      if (
        ![
          "draft",
          "pending_approval",
          "approved",
        ].includes(
          settlement.status,
        )
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "This settlement can no longer be cancelled from its current status.",
          });
      }

      if (
        settlement.payout
          .razorpayPayoutId ||
        ACTIVE_PAYOUT_STATUSES.includes(
          settlement.payout
            .providerStatus,
        )
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "The payout has already been initiated and cannot be cancelled from HHS.",
          });
      }

      settlement.status =
        "cancelled";

      addSettlementHistory(
        {
          settlement,

          action:
            "cancelled",

          note:
            reason,

          changedBy,

          source:
            "admin",
        },
      );

      await settlement.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Settlement cancelled successfully.",

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      return sendControllerError(
        {
          res,

          error,

          operation:
            "Cancel settlement error",

          fallbackMessage:
            "Unable to cancel the settlement.",
        },
      );
    }
  };

/* =====================================
   Initiate RazorpayX payout
===================================== */

export const initiateSettlementPayout =
  async (req, res) => {
    let settlement =
      null;

    try {
      const {
        id,
      } = req.params;

      const changedBy =
        getUserId(req);

      if (
        !isValidObjectId(
          id,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement ID.",
          });
      }

      const sourceAccountNumber =
        getRazorpaySourceAccountNumber();

      const {
        keyId,
        keySecret,
      } =
        getProviderCredentials();

      if (
        !keyId ||
        !keySecret
      ) {
        return res
          .status(503)
          .json({
            success:
              false,

            message:
              "RazorpayX credentials are missing from the backend environment.",
          });
      }

      if (
        !sourceAccountNumber
      ) {
        return res
          .status(503)
          .json({
            success:
              false,

            message:
              "RAZORPAYX_ACCOUNT_NUMBER is missing from the backend environment.",
          });
      }

      settlement =
        await OwnerSettlement.findById(
          id,
        ).select(
          "+payout.idempotencyKey",
        );

      if (
        !settlement
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Settlement not found.",
          });
      }

      if (
        settlement.payout
          .razorpayPayoutId
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "A Razorpay payout already exists for this settlement. Synchronize its status instead.",
          });
      }

      const retryingUnknownResult =
        settlement.status ===
          "processing" &&
        Boolean(
          settlement.payout
            .idempotencyKey,
        );

      const retryingDefiniteFailure =
        settlement.status ===
        "failed";

      if (
        settlement.status !==
          "approved" &&
        !retryingUnknownResult &&
        !retryingDefiniteFailure
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Only an approved settlement can be sent for payout.",
          });
      }

      if (
        settlement
          .totals
          .netPayoutInSubunits <
        MINIMUM_PAYOUT_IN_SUBUNITS
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "The settlement net payout must be at least one rupee.",
          });
      }

      const payoutAccountResult =
        await getVerifiedPayoutAccount(
          {
            ownerId:
              settlement.owner,

            payoutAccountId:
              settlement.payoutAccount,
          },
        );

      if (
        payoutAccountResult.error
      ) {
        return res
          .status(
            payoutAccountResult.status,
          )
          .json({
            success:
              false,

            message:
              payoutAccountResult.error,
          });
      }

      const {
        payoutAccount,
      } =
        payoutAccountResult;

      const expectedPayoutMode =
        getPayoutMode(
          settlement.payoutMode,
          payoutAccount,
        );

      if (
        !expectedPayoutMode
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "The settlement payout mode does not match the owner's payout account type.",
          });
      }

      if (
        retryingDefiniteFailure ||
        !settlement.payout
          .idempotencyKey
      ) {
        settlement.payout.idempotencyKey =
          crypto.randomUUID();
      }

      if (
        !retryingUnknownResult
      ) {
        settlement.status =
          "processing";

        settlement.payout.provider =
          "razorpayx";

        settlement.payout.providerStatus =
          "processing";

        settlement.payout.initiatedAt =
          new Date();

        settlement.payout.failedAt =
          null;

        settlement.payout.failureCode =
          "";

        settlement.payout.failureReason =
          "";

        addSettlementHistory(
          {
            settlement,

            action:
              retryingDefiniteFailure
                ? "payout_retried"
                : "payout_initiated",

            note:
              retryingDefiniteFailure
                ? "Razorpay payout retried after a definite failure."
                : "Razorpay payout initiated.",

            changedBy,

            source:
              "admin",
          },
        );
      } else {
        addSettlementHistory(
          {
            settlement,

            action:
              "payout_request_retried",

            note:
              "Razorpay payout request retried with the same idempotency key after an uncertain response.",

            changedBy,

            source:
              "admin",
          },
        );
      }

      await settlement.save();

      const payoutData =
        await razorpayRequest(
          {
            method:
              "POST",

            path:
              "/v1/payouts",

            idempotencyKey:
              settlement.payout
                .idempotencyKey,

            body: {
              account_number:
                sourceAccountNumber,

              fund_account_id:
                payoutAccount
                  .razorpay
                  .fundAccountId,

              amount:
                settlement
                  .totals
                  .netPayoutInSubunits,

              currency:
                "INR",

              mode:
                settlement.payoutMode,

              purpose:
                "payout",

              queue_if_low_balance:
                true,

              reference_id:
                settlement
                  .settlementReference
                  .slice(
                    0,
                    40,
                  ),

              narration:
                "HHS Owner Payout",

              notes: {
                platform:
                  "HHS",

                settlement_id:
                  String(
                    settlement._id,
                  ),

                settlement_reference:
                  settlement
                    .settlementReference,

                owner_id:
                  String(
                    settlement.owner,
                  ),
              },
            },
          },
        );

      applyProviderPayout({
        settlement,

        payoutData,

        changedBy,
      });

      await settlement.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            settlement.status ===
            "processed"
              ? "Owner payout processed successfully."
              : "Owner payout submitted to Razorpay successfully.",

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      if (
        settlement &&
        error.isProviderError
      ) {
        const errorMessage =
          normalizeText(
            error.message,
          ).slice(
            0,
            1000,
          );

        if (
          error.isAmbiguous
        ) {
          settlement.status =
            "processing";

          settlement.payout.provider =
            "razorpayx";

          settlement.payout.providerStatus =
            "processing";

          settlement.payout.failureCode =
            "PROVIDER_RESULT_UNKNOWN";

          settlement.payout.failureReason =
            errorMessage;

          settlement.payout.lastProviderSyncAt =
            new Date();

          addSettlementHistory(
            {
              settlement,

              action:
                "payout_result_unknown",

              note:
                "Razorpay response was not confirmed. Retry the payout request to safely reuse the same idempotency key.",

              changedBy:
                getUserId(
                  req,
                ),

              source:
                "system",
            },
          );

          await settlement
            .save()
            .catch(
              (
                saveError,
              ) => {
                console.error(
                  "Save uncertain payout result error:",
                  saveError.message,
                );
              },
            );

          return res
            .status(502)
            .json({
              success:
                false,

              payoutResultUnknown:
                true,

              message:
                "Razorpay did not confirm the payout result. Do not create a new settlement; retry this payout to safely reuse the same request key.",

              settlement:
                serializeSettlement(
                  settlement,
                ),
            });
        }

        settlement.status =
          "failed";

        settlement.payout.provider =
          "razorpayx";

        settlement.payout.providerStatus =
          "failed";

        settlement.payout.failureCode =
          normalizeText(
            error.providerData
              ?.error
              ?.code ||
              "PAYOUT_REQUEST_FAILED",
          );

        settlement.payout.failureReason =
          errorMessage;

        settlement.payout.failedAt =
          new Date();

        settlement.payout.lastProviderSyncAt =
          new Date();

        addSettlementHistory(
          {
            settlement,

            action:
              "payout_failed",

            note:
              errorMessage,

            changedBy:
              getUserId(req),

            source:
              "razorpay",
          },
        );

        await settlement
          .save()
          .catch(
            (
              saveError,
            ) => {
              console.error(
                "Save failed payout error:",
                saveError.message,
              );
            },
          );

        return res
          .status(
            error.status ===
              503
              ? 503
              : 502,
          )
          .json({
            success:
              false,

            message:
              error.exposeMessage
                ? error.message
                : "Razorpay rejected the owner payout request.",

            settlement:
              serializeSettlement(
                settlement,
              ),
          });
      }

      return sendControllerError(
        {
          res,

          error,

          operation:
            "Initiate settlement payout error",

          fallbackMessage:
            "Unable to initiate the owner payout.",
        },
      );
    }
  };

/* =====================================
   Synchronize Razorpay payout
===================================== */

export const syncSettlementPayout =
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const changedBy =
        getUserId(req);

      if (
        !isValidObjectId(
          id,
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid settlement ID.",
          });
      }

      const settlement =
        await OwnerSettlement.findById(
          id,
        );

      if (
        !settlement
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Settlement not found.",
          });
      }

      if (
        !settlement.payout
          .razorpayPayoutId
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "No Razorpay payout ID is available. If the initial response was uncertain, retry the payout request instead.",
          });
      }

      const payoutData =
        await razorpayRequest(
          {
            method:
              "GET",

            path:
              `/v1/payouts/${encodeURIComponent(
                settlement
                  .payout
                  .razorpayPayoutId,
              )}`,
          },
        );

      applyProviderPayout({
        settlement,

        payoutData,

        changedBy,
      });

      await settlement.save();

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Settlement payout status synchronized successfully.",

          settlement:
            serializeSettlement(
              settlement,
            ),
        });
    } catch (error) {
      if (
        error.isProviderError
      ) {
        console.error(
          "Synchronize payout provider error:",
          error.message,
        );

        return res
          .status(
            error.status ===
              503
              ? 503
              : 502,
          )
          .json({
            success:
              false,

            message:
              "Unable to retrieve the latest payout status from Razorpay.",
          });
      }

      return sendControllerError(
        {
          res,

          error,

          operation:
            "Synchronize settlement payout error",

          fallbackMessage:
            "Unable to synchronize the settlement payout.",
        },
      );
    }
  };