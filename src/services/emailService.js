import nodemailer from "nodemailer";

let transporter = null;

/* =====================================
   Configuration helpers
===================================== */

const normalizeBoolean = (
  value,
  fallback = false
) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (
    value === "true" ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === "false" ||
    value === "0"
  ) {
    return false;
  }

  return fallback;
};

const getFrontendUrl = () => {
  return (
    process.env.FRONTEND_URL ||
    "https://hogenakkalhomestays.com/"
  ).replace(/\/+$/, "");
};

const getTransporter = () => {
  const host =
    process.env.SMTP_HOST?.trim();

  const user =
    process.env.SMTP_USER?.trim();

  const pass =
    process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP configuration is missing from the backend .env file."
    );
  }

  if (transporter) {
    return transporter;
  }

  const port =
    Number(
      process.env.SMTP_PORT
    ) || 465;

  transporter =
    nodemailer.createTransport({
      host,
      port,

      secure: normalizeBoolean(
        process.env.SMTP_SECURE,
        port === 465
      ),

      auth: {
        user,
        pass,
      },
    });

  return transporter;
};

/* =====================================
   Formatting helpers
===================================== */

const escapeHtml = (
  value = ""
) => {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const formatCurrency = (
  amount
) => {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }
  ).format(
    Number(amount) || 0
  );
};

const formatDate = (
  value,
  includeTime = false
) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Not available";
  }

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",

      ...(includeTime
        ? {
            hour: "2-digit",
            minute: "2-digit",
          }
        : {}),
    }
  );
};

const formatStatus = (
  status
) => {
  return String(
    status || "pending"
  )
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
};

const getCustomerName = (
  booking
) => {
  return (
    booking?.customer?.fullName ||
    booking?.primaryGuest
      ?.fullName ||
    "Guest"
  );
};

const getCustomerEmail = (
  booking
) => {
  return (
    booking?.customer?.email ||
    booking?.primaryGuest?.email ||
    ""
  );
};

const getPropertyTitle = (
  booking
) => {
  return (
    booking?.property?.title ||
    "HHS Property"
  );
};

const getBookingAmount = (
  booking
) => {
  return Number(
    booking?.priceDetails
      ?.grandTotal || 0
  );
};

const getReceiptUrl = (
  booking
) => {
  const bookingId =
    booking?._id ||
    booking?.id;

  return bookingId
    ? `${getFrontendUrl()}/bookings/${bookingId}/receipt`
    : `${getFrontendUrl()}/bookings`;
};

/* =====================================
   Email template helpers
===================================== */

const createDetailRows = (
  details = []
) => {
  return details
    .map(
      ({
        label,
        value,
      }) => `
        <tr>
          <td style="padding:10px 0;color:#64748b;font-size:13px;">
            ${escapeHtml(label)}
          </td>

          <td style="padding:10px 0;color:#0f172a;font-size:13px;font-weight:700;text-align:right;">
            ${escapeHtml(value)}
          </td>
        </tr>
      `
    )
    .join("");
};

const createEmailTemplate = ({
  preview,
  label,
  heading,
  greeting,
  message,
  details = [],
  buttonText =
    "View My Bookings",
  buttonUrl =
    `${getFrontendUrl()}/bookings`,
}) => {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />

      <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
      />

      <title>
        ${escapeHtml(heading)}
      </title>
    </head>

    <body style="margin:0;padding:0;color:#0f172a;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        ${escapeHtml(preview)}
      </div>

      <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        style="padding:30px 12px;background:#f1f5f9;"
      >
        <tr>
          <td align="center">
            <table
              role="presentation"
              width="100%"
              cellspacing="0"
              cellpadding="0"
              style="max-width:620px;overflow:hidden;border-radius:20px;background:#ffffff;box-shadow:0 14px 35px rgba(15,23,42,0.08);"
            >
              <tr>
                <td style="padding:28px 34px;color:#ffffff;background:linear-gradient(135deg,#0e7490,#06b6d4);">
                  <div style="font-size:20px;font-weight:900;letter-spacing:2px;">
                    HHS
                  </div>

                  <div style="margin-top:6px;font-size:12px;opacity:0.9;">
                    Hogenakkal Home Stay
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:34px;">
                  <p style="margin:0;color:#0891b2;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">
                    ${escapeHtml(label)}
                  </p>

                  <h1 style="margin:10px 0 18px;color:#071827;font-size:28px;line-height:1.25;">
                    ${escapeHtml(heading)}
                  </h1>

                  <p style="margin:0;color:#334155;font-size:15px;line-height:1.7;">
                    ${escapeHtml(greeting)}
                  </p>

                  <p style="margin:10px 0 0;color:#64748b;font-size:14px;line-height:1.7;">
                    ${escapeHtml(message)}
                  </p>

                  <table
                    role="presentation"
                    width="100%"
                    cellspacing="0"
                    cellpadding="0"
                    style="margin-top:24px;padding:12px 20px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;"
                  >
                    ${createDetailRows(
                      details
                    )}
                  </table>

                  <div style="margin-top:28px;">
                    <a
                      href="${escapeHtml(
                        buttonUrl
                      )}"
                      style="display:inline-block;padding:13px 22px;border-radius:10px;color:#ffffff;background:#0891b2;text-decoration:none;font-size:13px;font-weight:800;"
                    >
                      ${escapeHtml(
                        buttonText
                      )}
                    </a>
                  </div>

                  <p style="margin:28px 0 0;color:#94a3b8;font-size:11px;line-height:1.6;">
                    This is an automated email from HHS.
                    Never share passwords or payment credentials
                    by email.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:18px 34px;border-top:1px solid #e2e8f0;color:#94a3b8;background:#f8fafc;font-size:11px;text-align:center;">
                  © ${new Date().getFullYear()}
                  VeeraWebTech · HHS, Hogenakkal
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};

const getBookingDetails = (
  booking
) => {
  return [
    {
      label:
        "Booking reference",

      value:
        booking?.bookingReference ||
        "Not available",
    },

    {
      label: "Property",

      value:
        getPropertyTitle(booking),
    },

    {
      label: "Check-in",

      value: formatDate(
        booking?.checkInDate
      ),
    },

    {
      label: "Check-out",

      value: formatDate(
        booking?.checkOutDate
      ),
    },

    {
      label: "Guests",

      value: String(
        booking?.numberOfGuests ||
          1
      ),
    },

    {
      label: "Rooms",

      value: String(
        booking?.numberOfRooms ||
          1
      ),
    },

    {
      label: "Total",

      value: formatCurrency(
        getBookingAmount(booking)
      ),
    },
  ];
};

/* =====================================
   Base email sender
===================================== */

export const sendEmailSafely =
  async ({
    to,
    subject,
    text,
    html,
  }) => {
    try {
      if (!to?.trim()) {
        throw new Error(
          "Email recipient is missing."
        );
      }

      const fromAddress =
        process.env
          .MAIL_FROM_EMAIL?.trim() ||
        process.env.SMTP_USER?.trim();

      const result =
        await getTransporter().sendMail({
          from: {
            name:
              process.env
                .MAIL_FROM_NAME?.trim() ||
              "HHS - Hogenakkal Home Stay",

            address: fromAddress,
          },

          to: to.trim(),
          subject,
          text,
          html,
          replyTo: fromAddress,
        });

      console.log(
        `HHS email sent: ${result.messageId}`
      );

      return {
        success: true,

        messageId:
          result.messageId,
      };
    } catch (error) {
      console.error(
        "HHS email failed:",
        error.message
      );

      return {
        success: false,
        error: error.message,
      };
    }
  };

/* =====================================
   Booking created email
===================================== */

export const sendBookingCreatedEmail =
  async (booking) => {
    const customerName =
      getCustomerName(booking);

    return sendEmailSafely({
      to:
        getCustomerEmail(booking),

      subject:
        `Booking received · ${booking.bookingReference}`,

      text:
        `Hello ${customerName}, booking ` +
        `${booking.bookingReference} was received. ` +
        `Complete payment before the temporary room hold expires.`,

      html: createEmailTemplate({
        preview:
          `Booking ${booking.bookingReference} ` +
          `is awaiting payment.`,

        label:
          "Booking received",

        heading:
          "Complete payment to confirm your stay",

        greeting:
          `Hello ${customerName},`,

        message:
          "Your rooms are temporarily reserved. " +
          "Complete payment before the hold expires " +
          "to confirm your booking.",

        details: [
          ...getBookingDetails(
            booking
          ),

          {
            label:
              "Hold expires",

            value: formatDate(
              booking?.holdExpiresAt,
              true
            ),
          },
        ],

        buttonText:
          "Complete Payment",

        buttonUrl:
          `${getFrontendUrl()}/bookings`,
      }),
    });
  };

/* =====================================
   Booking cancelled email
===================================== */

export const sendBookingCancelledEmail =
  async (booking) => {
    const customerName =
      getCustomerName(booking);

    return sendEmailSafely({
      to:
        getCustomerEmail(booking),

      subject:
        `Booking cancelled · ${booking.bookingReference}`,

      text:
        `Hello ${customerName}, booking ` +
        `${booking.bookingReference} has been cancelled.`,

      html: createEmailTemplate({
        preview:
          `Booking ${booking.bookingReference} ` +
          `has been cancelled.`,

        label:
          "Booking update",

        heading:
          "Your booking was cancelled",

        greeting:
          `Hello ${customerName},`,

        message:
          "Your booking has been cancelled. " +
          "If payment was completed, its refund status " +
          "will appear in My Bookings.",

        details: [
          ...getBookingDetails(
            booking
          ),

          {
            label:
              "Cancellation reason",

            value:
              booking?.cancellation
                ?.reason ||
              "Not provided",
          },

          {
            label:
              "Payment status",

            value: formatStatus(
              booking?.paymentStatus
            ),
          },
        ],

        buttonText:
          "View My Bookings",

        buttonUrl:
          `${getFrontendUrl()}/bookings`,
      }),
    });
  };

/* =====================================
   Booking status emails
===================================== */

const BOOKING_STATUS_CONTENT =
  {
    confirmed: {
      subject:
        "Booking confirmed",

      heading:
        "Your stay is confirmed",

      message:
        "Your booking is confirmed. Keep your booking reference and payment receipt available when you arrive.",

      buttonText:
        "View Receipt",
    },

    checked_in: {
      subject:
        "Check-in completed",

      heading:
        "Welcome to your stay",

      message:
        "Your check-in has been completed. We hope you have a comfortable and memorable stay in Hogenakkal.",

      buttonText:
        "View Booking",
    },

    completed: {
      subject:
        "Stay completed",

      heading:
        "Thank you for staying with HHS",

      message:
        "Your stay has been marked as completed. Thank you for choosing HHS, and we look forward to welcoming you again.",

      buttonText:
        "Explore More Stays",
    },

    no_show: {
      subject:
        "Booking marked as no-show",

      heading:
        "Your booking was marked as no-show",

      message:
        "The property team marked this booking as a no-show. Contact HHS support if you believe this status is incorrect.",

      buttonText:
        "View Booking",
    },
  };

/*
   This named export fixes the current error.
*/

export const sendBookingStatusEmail =
  async (booking) => {
    const status =
      booking?.bookingStatus;

    const content =
      BOOKING_STATUS_CONTENT[
        status
      ];

    if (!content) {
      return {
        success: true,
        skipped: true,
      };
    }

    const customerName =
      getCustomerName(booking);

    const buttonUrl =
      status === "confirmed"
        ? getReceiptUrl(booking)
        : status === "completed"
          ? `${getFrontendUrl()}/explore`
          : `${getFrontendUrl()}/bookings`;

    return sendEmailSafely({
      to:
        getCustomerEmail(booking),

      subject:
        `${content.subject} · ` +
        `${booking.bookingReference}`,

      text:
        `Hello ${customerName}, ` +
        `${content.message} ` +
        `Booking reference: ${booking.bookingReference}.`,

      html: createEmailTemplate({
        preview:
          `${content.subject} for ` +
          `${booking.bookingReference}.`,

        label:
          "Booking update",

        heading:
          content.heading,

        greeting:
          `Hello ${customerName},`,

        message:
          content.message,

        details: [
          ...getBookingDetails(
            booking
          ),

          {
            label:
              "Booking status",

            value:
              formatStatus(status),
          },
        ],

        buttonText:
          content.buttonText,

        buttonUrl,
      }),
    });
  };

/* =====================================
   Payment successful email
===================================== */

export const sendPaymentSuccessfulEmail =
  async (booking) => {
    const customerName =
      getCustomerName(booking);

    return sendEmailSafely({
      to:
        getCustomerEmail(booking),

      subject:
        `Payment successful · ${booking.bookingReference}`,

      text:
        `Hello ${customerName}, payment of ` +
        `${formatCurrency(
          getBookingAmount(booking)
        )} was successful and booking ` +
        `${booking.bookingReference} is confirmed.`,

      html: createEmailTemplate({
        preview:
          `Payment received for ` +
          `${booking.bookingReference}.`,

        label:
          "Payment received",

        heading:
          "Your booking is confirmed",

        greeting:
          `Hello ${customerName},`,

        message:
          "Your Razorpay payment was verified successfully. " +
          "Keep the receipt available for check-in.",

        details: [
          ...getBookingDetails(
            booking
          ),

          {
            label: "Payment ID",

            value:
              booking?.payment
                ?.razorpayPaymentId ||
              "Not available",
          },

          {
            label:
              "Payment status",

            value: formatStatus(
              booking?.paymentStatus
            ),
          },
        ],

        buttonText:
          "View Receipt",

        buttonUrl:
          getReceiptUrl(booking),
      }),
    });
  };

/* =====================================
   Late payment email
===================================== */

export const sendLatePaymentCapturedEmail =
  async (booking) => {
    const customerName =
      getCustomerName(booking);

    return sendEmailSafely({
      to:
        getCustomerEmail(booking),

      subject:
        `Payment received after expiry · ` +
        `${booking.bookingReference}`,

      text:
        `Hello ${customerName}, payment was received after ` +
        `booking ${booking.bookingReference} expired. ` +
        `The booking was not confirmed and a refund is pending.`,

      html: createEmailTemplate({
        preview:
          `Payment received after ` +
          `${booking.bookingReference} expired.`,

        label:
          "Payment update",

        heading:
          "Your payment requires a refund",

        greeting:
          `Hello ${customerName},`,

        message:
          "Razorpay captured the payment after the temporary " +
          "booking hold expired. The booking was not confirmed " +
          "and the payment has been marked for refund.",

        details: [
          ...getBookingDetails(
            booking
          ),

          {
            label:
              "Payment ID",

            value:
              booking?.payment
                ?.razorpayPaymentId ||
              "Not available",
          },

          {
            label:
              "Payment status",

            value: formatStatus(
              booking?.paymentStatus
            ),
          },
        ],

        buttonText:
          "View Refund Status",

        buttonUrl:
          `${getFrontendUrl()}/bookings`,
      }),
    });
  };

/* =====================================
   Refund email
===================================== */

export const sendRefundStatusEmail =
  async ({
    booking,
    refund,
    processed = false,
  }) => {
    const customerName =
      getCustomerName(booking);

    const refundAmount =
      Number(
        refund?.amountInSubunits ||
          0
      ) / 100;

    const statusText =
      processed
        ? "processed"
        : "initiated";

    return sendEmailSafely({
      to:
        getCustomerEmail(booking),

      subject:
        `Refund ${statusText} · ` +
        `${booking.bookingReference}`,

      text:
        `Hello ${customerName}, your refund of ` +
        `${formatCurrency(refundAmount)} has been ${statusText}.`,

      html: createEmailTemplate({
        preview:
          `Refund ${statusText} for ` +
          `${booking.bookingReference}.`,

        label:
          "Refund update",

        heading: processed
          ? "Refund processed"
          : "Refund initiated",

        greeting:
          `Hello ${customerName},`,

        message: processed
          ? "Razorpay processed the refund. Your bank may take a few business days to display the amount."
          : "The refund request was submitted to Razorpay. We will update the status when processing is completed.",

        details: [
          {
            label:
              "Booking reference",

            value:
              booking.bookingReference,
          },

          {
            label:
              "Refund amount",

            value:
              formatCurrency(
                refundAmount
              ),
          },

          {
            label:
              "Refund ID",

            value:
              refund
                ?.razorpayRefundId ||
              refund?.id ||
              "Not available",
          },

          {
            label:
              "Refund status",

            value: processed
              ? "Processed"
              : "Pending",
          },
        ],

        buttonText:
          "View My Bookings",

        buttonUrl:
          `${getFrontendUrl()}/bookings`,
      }),
    });
  };