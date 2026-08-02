import nodemailer from "nodemailer";

let transporter = null;

/* =====================================
   Helpers
===================================== */

const normalizeBoolean = (
  value,
  fallbackValue = false
) => {
  if (
    typeof value === "boolean"
  ) {
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

  return fallbackValue;
};

const getSmtpPort = () => {
  const port = Number(
    process.env.SMTP_PORT
  );

  if (
    Number.isInteger(port) &&
    port > 0
  ) {
    return port;
  }

  return 587;
};

/* =====================================
   Mail configuration
===================================== */

export const isEmailConfigured =
  () => {
    return Boolean(
      process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASS?.trim()
    );
  };

export const getMailFromAddress =
  () => {
    return (
      process.env.MAIL_FROM_EMAIL?.trim() ||
      process.env.SMTP_USER?.trim() ||
      ""
    );
  };

export const getMailFromName =
  () => {
    return (
      process.env.MAIL_FROM_NAME?.trim() ||
      "HHS - Hogenakkal Home Stay"
    );
  };

export const getMailTransporter =
  () => {
    if (!isEmailConfigured()) {
      const error = new Error(
        "Email is not configured. Add SMTP_HOST, SMTP_USER and SMTP_PASS to the backend .env file."
      );

      error.code =
        "EMAIL_NOT_CONFIGURED";

      throw error;
    }

    if (transporter) {
      return transporter;
    }

    const port =
      getSmtpPort();

    const secure =
      normalizeBoolean(
        process.env.SMTP_SECURE,
        port === 465
      );

    transporter =
      nodemailer.createTransport({
        host:
          process.env.SMTP_HOST.trim(),

        port,
        secure,

        auth: {
          user:
            process.env.SMTP_USER.trim(),

          pass:
            process.env.SMTP_PASS.trim(),
        },

        connectionTimeout:
          15_000,

        greetingTimeout:
          15_000,

        socketTimeout:
          30_000,

        tls: {
          rejectUnauthorized:
            process.env.NODE_ENV ===
              "production" ||
            !normalizeBoolean(
              process.env
                .SMTP_ALLOW_SELF_SIGNED,
              false
            ),
        },
      });

    return transporter;
  };

export const verifyEmailConnection =
  async () => {
    const mailTransporter =
      getMailTransporter();

    await mailTransporter.verify();

    return true;
  };

export const resetMailTransporter =
  () => {
    if (transporter?.close) {
      transporter.close();
    }

    transporter = null;
  };