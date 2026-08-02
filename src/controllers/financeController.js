import Booking from "../models/Booking.js";

/* =====================================
   Finance constants
===================================== */

const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refund_pending",
  "partially_refunded",
  "refunded",
];

const CAPTURED_PAYMENT_STATUSES = [
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
];

/* =====================================
   Helpers
===================================== */

const escapeRegularExpression = (value = "") => {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

const parsePositiveInteger = (
  value,
  fallbackValue,
  maximumValue
) => {
  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 1
  ) {
    return fallbackValue;
  }

  return Math.min(
    parsedValue,
    maximumValue
  );
};

const parseDateBoundary = (
  value,
  endOfDay = false
) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const createDateRange = (
  dateFrom,
  dateTo
) => {
  const startDate =
    parseDateBoundary(dateFrom);

  const endDate =
    parseDateBoundary(dateTo, true);

  if (
    startDate &&
    endDate &&
    startDate > endDate
  ) {
    const error = new Error(
      "The start date cannot be after the end date."
    );

    error.status = 400;

    throw error;
  }

  if (!startDate && !endDate) {
    return null;
  }

  const dateRange = {};

  if (startDate) {
    dateRange.$gte = startDate;
  }

  if (endDate) {
    dateRange.$lte = endDate;
  }

  return dateRange;
};

const getTransactionDateExpression = () => {
  return {
    $ifNull: [
      "$payment.paidAt",
      "$createdAt",
    ],
  };
};

const getRefundAmountExpression = (
  status
) => {
  return {
    $divide: [
      {
        $sum: {
          $map: {
            input: {
              $filter: {
                input: {
                  $ifNull: [
                    "$refunds",
                    [],
                  ],
                },

                as: "refund",

                cond: {
                  $eq: [
                    "$$refund.status",
                    status,
                  ],
                },
              },
            },

            as: "refund",

            in: {
              $ifNull: [
                "$$refund.amountInSubunits",
                0,
              ],
            },
          },
        },
      },

      100,
    ],
  };
};

const createTransactionFilter = ({
  search,
  paymentStatus,
  dateFrom,
  dateTo,
}) => {
  const conditions = [
    {
      $or: [
        {
          "payment.razorpayOrderId": {
            $type: "string",
          },
        },

        {
          paymentStatus: {
            $in: [
              "paid",
              "failed",
              "refund_pending",
              "partially_refunded",
              "refunded",
            ],
          },
        },
      ],
    },
  ];

  if (search?.trim()) {
    const safeSearch =
      escapeRegularExpression(
        search.trim()
      );

    const searchExpression =
      new RegExp(safeSearch, "i");

    conditions.push({
      $or: [
        {
          bookingReference:
            searchExpression,
        },

        {
          "primaryGuest.fullName":
            searchExpression,
        },

        {
          "primaryGuest.email":
            searchExpression,
        },

        {
          "primaryGuest.phone":
            searchExpression,
        },

        {
          "payment.razorpayOrderId":
            searchExpression,
        },

        {
          "payment.razorpayPaymentId":
            searchExpression,
        },
      ],
    });
  }

  if (
    paymentStatus &&
    paymentStatus !== "all"
  ) {
    if (
      !PAYMENT_STATUSES.includes(
        paymentStatus
      )
    ) {
      const error = new Error(
        "Invalid payment status filter."
      );

      error.status = 400;

      throw error;
    }

    conditions.push({
      paymentStatus,
    });
  }

  const dateRange = createDateRange(
    dateFrom,
    dateTo
  );

  if (dateRange) {
    conditions.push({
      createdAt: dateRange,
    });
  }

  return conditions.length === 1
    ? conditions[0]
    : {
        $and: conditions,
      };
};

const serializeTransaction = (
  booking
) => {
  const processedRefundAmount = (
    booking.refunds || []
  )
    .filter((refund) => {
      return (
        refund.status === "processed"
      );
    })
    .reduce((total, refund) => {
      return (
        total +
        Number(
          refund.amountInSubunits || 0
        ) /
          100
      );
    }, 0);

  const pendingRefundAmount = (
    booking.refunds || []
  )
    .filter((refund) => {
      return (
        refund.status === "pending"
      );
    })
    .reduce((total, refund) => {
      return (
        total +
        Number(
          refund.amountInSubunits || 0
        ) /
          100
      );
    }, 0);

  return {
    _id: booking._id,
    bookingId: booking._id,

    bookingReference:
      booking.bookingReference,

    bookingStatus:
      booking.bookingStatus,

    paymentStatus:
      booking.paymentStatus,

    paymentMethod:
      booking.paymentMethod,

    amount: Number(
      booking.priceDetails
        ?.grandTotal || 0
    ),

    currency:
      booking.payment?.currency ||
      "INR",

    orderId:
      booking.payment
        ?.razorpayOrderId || "",

    paymentId:
      booking.payment
        ?.razorpayPaymentId || "",

    orderStatus:
      booking.payment?.orderStatus ||
      "none",

    failureCode:
      booking.payment?.failureCode ||
      "",

    failureDescription:
      booking.payment
        ?.failureDescription || "",

    paidAt:
      booking.payment?.paidAt || null,

    failedAt:
      booking.payment?.failedAt ||
      null,

    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,

    processedRefundAmount,
    pendingRefundAmount,

    customer: booking.customer,
    owner: booking.owner,
    property: booking.property,

    primaryGuest:
      booking.primaryGuest,

    refunds: booking.refunds || [],
  };
};

/* =====================================
   Get finance summary

   GET /api/payments/admin/summary
===================================== */

export const getFinanceSummary = async (
  req,
  res
) => {
  try {
    const {
      dateFrom,
      dateTo,
    } = req.query;

    const dateRange =
      createDateRange(
        dateFrom,
        dateTo
      );

    const capturedMatch = {
      paymentStatus: {
        $in: CAPTURED_PAYMENT_STATUSES,
      },

      "payment.razorpayPaymentId": {
        $type: "string",
      },
    };

    const statusMatch = {};

    if (dateRange) {
      statusMatch.createdAt =
        dateRange;
    }

    const capturedPipeline = [
      {
        $match: capturedMatch,
      },

      {
        $addFields: {
          financeTransactionDate:
            getTransactionDateExpression(),
        },
      },
    ];

    if (dateRange) {
      capturedPipeline.push({
        $match: {
          financeTransactionDate:
            dateRange,
        },
      });
    }

    capturedPipeline.push(
      {
        $project: {
          amount: {
            $ifNull: [
              "$priceDetails.grandTotal",
              0,
            ],
          },

          processedRefundAmount:
            getRefundAmountExpression(
              "processed"
            ),

          pendingRefundAmount:
            getRefundAmountExpression(
              "pending"
            ),

          paymentStatus: 1,
        },
      },

      {
        $group: {
          _id: null,

          capturedPayments: {
            $sum: 1,
          },

          grossRevenue: {
            $sum: "$amount",
          },

          refundedAmount: {
            $sum:
              "$processedRefundAmount",
          },

          pendingRefundAmount: {
            $sum:
              "$pendingRefundAmount",
          },

          fullyRefundedPayments: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$paymentStatus",
                    "refunded",
                  ],
                },
                1,
                0,
              ],
            },
          },

          partiallyRefundedPayments: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$paymentStatus",
                    "partially_refunded",
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      }
    );

    const [
      capturedResults,
      paymentStatusResults,
      refundStatusResults,
    ] = await Promise.all([
      Booking.aggregate(
        capturedPipeline
      ),

      Booking.aggregate([
        {
          $match: statusMatch,
        },

        {
          $group: {
            _id: "$paymentStatus",

            count: {
              $sum: 1,
            },
          },
        },
      ]),

      Booking.aggregate([
        {
          $match: statusMatch,
        },

        {
          $unwind: "$refunds",
        },

        {
          $group: {
            _id: "$refunds.status",

            count: {
              $sum: 1,
            },

            amount: {
              $sum: {
                $divide: [
                  "$refunds.amountInSubunits",
                  100,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const capturedSummary =
      capturedResults[0] || {
        capturedPayments: 0,
        grossRevenue: 0,
        refundedAmount: 0,
        pendingRefundAmount: 0,
        fullyRefundedPayments: 0,
        partiallyRefundedPayments: 0,
      };

    const paymentCounts =
      PAYMENT_STATUSES.reduce(
        (result, status) => {
          result[status] = 0;

          return result;
        },
        {}
      );

    paymentStatusResults.forEach(
      (item) => {
        if (item._id) {
          paymentCounts[item._id] =
            item.count;
        }
      }
    );

    const refundCounts = {
      pending: 0,
      processed: 0,
      failed: 0,
    };

    refundStatusResults.forEach(
      (item) => {
        if (
          item._id &&
          refundCounts[item._id] !==
            undefined
        ) {
          refundCounts[item._id] =
            item.count;
        }
      }
    );

    const grossRevenue = Number(
      capturedSummary.grossRevenue ||
        0
    );

    const refundedAmount = Number(
      capturedSummary.refundedAmount ||
        0
    );

    return res.status(200).json({
      success: true,

      summary: {
        grossRevenue,

        refundedAmount,

        pendingRefundAmount:
          Number(
            capturedSummary.pendingRefundAmount ||
              0
          ),

        netRevenue: Math.max(
          grossRevenue -
            refundedAmount,
          0
        ),

        capturedPayments: Number(
          capturedSummary.capturedPayments ||
            0
        ),

        fullyRefundedPayments:
          Number(
            capturedSummary.fullyRefundedPayments ||
              0
          ),

        partiallyRefundedPayments:
          Number(
            capturedSummary.partiallyRefundedPayments ||
              0
          ),

        paymentCounts,
        refundCounts,
      },

      filters: {
        dateFrom: dateFrom || "",
        dateTo: dateTo || "",
      },
    });
  } catch (error) {
    console.error(
      "Get finance summary error:",
      error
    );

    return res
      .status(error.status || 500)
      .json({
        success: false,

        message:
          error.message ||
          "Unable to load the finance summary.",
      });
  }
};

/* =====================================
   Get finance transactions

   GET /api/payments/admin/transactions
===================================== */

export const getFinanceTransactions =
  async (req, res) => {
    try {
      const {
        search = "",
        paymentStatus = "all",
        dateFrom = "",
        dateTo = "",
        sort = "newest",
        page = 1,
        limit = 20,
      } = req.query;

      const filter =
        createTransactionFilter({
          search,
          paymentStatus,
          dateFrom,
          dateTo,
        });

      const currentPage =
        parsePositiveInteger(
          page,
          1,
          1_000_000
        );

      const pageSize =
        parsePositiveInteger(
          limit,
          20,
          100
        );

      const skip =
        (currentPage - 1) *
        pageSize;

      const sortOptions = {
        newest: {
          "payment.paidAt": -1,
          createdAt: -1,
        },

        oldest: {
          createdAt: 1,
        },

        amountHigh: {
          "priceDetails.grandTotal":
            -1,

          createdAt: -1,
        },

        amountLow: {
          "priceDetails.grandTotal":
            1,

          createdAt: -1,
        },
      };

      const selectedSort =
        sortOptions[sort] ||
        sortOptions.newest;

      const [
        bookings,
        totalTransactions,
      ] = await Promise.all([
        Booking.find(filter)
          .populate(
            "customer",
            "fullName email phone role"
          )
          .populate(
            "owner",
            "fullName email phone role"
          )
          .populate(
            "property",
            "title propertyType location"
          )
          .populate(
            "refunds.initiatedBy",
            "fullName email role"
          )
          .sort(selectedSort)
          .skip(skip)
          .limit(pageSize)
          .lean(),

        Booking.countDocuments(
          filter
        ),
      ]);

      const totalPages = Math.max(
        Math.ceil(
          totalTransactions /
            pageSize
        ),
        1
      );

      return res.status(200).json({
        success: true,

        transactions:
          bookings.map(
            serializeTransaction
          ),

        pagination: {
          currentPage,
          totalPages,
          totalTransactions,
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
        "Get finance transactions error:",
        error
      );

      return res
        .status(error.status || 500)
        .json({
          success: false,

          message:
            error.message ||
            "Unable to load payment transactions.",
        });
    }
  };