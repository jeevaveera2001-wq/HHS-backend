import {
  sendEmailSafely,
} from "./emailService.js";

/* =====================================
   Helpers
===================================== */

const escapeHtml = (
  value = ""
) => {
  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
};

const getFrontendUrl = () => {
  const configuredUrl =
    process.env.FRONTEND_URL ||
    "http://localhost:5173";

  return configuredUrl
    .split(",")[0]
    .trim()
    .replace(
      /\/+$/,
      ""
    );
};

const createEmailLayout = ({
  preview,
  heading,
  message,
  buttonText,
  buttonUrl,
  securityMessage,
}) => {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />

      <meta
        name="viewport"
        content="width=device-width,initial-scale=1"
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
                    Hogenakkal Home Stays
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:34px;">
                  <p style="margin:0;color:#0891b2;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">
                    Account security
                  </p>

                  <h1 style="margin:10px 0 18px;color:#071827;font-size:28px;line-height:1.25;">
                    ${escapeHtml(heading)}
                  </h1>

                  <p style="margin:0;color:#475569;font-size:14px;line-height:1.8;">
                    ${escapeHtml(message)}
                  </p>

                  ${
                    buttonUrl
                      ? `
                        <div style="margin-top:28px;">
                          <a
                            href="${escapeHtml(
                              buttonUrl
                            )}"
                            style="display:inline-block;padding:14px 23px;border-radius:11px;color:#ffffff;background:#0891b2;text-decoration:none;font-size:13px;font-weight:800;"
                          >
                            ${escapeHtml(
                              buttonText
                            )}
                          </a>
                        </div>
                      `
                      : ""
                  }

                  <div style="margin-top:27px;padding:15px;border:1px solid #fde68a;border-radius:12px;color:#854d0e;background:#fffbeb;font-size:12px;line-height:1.7;">
                    ${escapeHtml(
                      securityMessage
                    )}
                  </div>

                  <p style="margin:27px 0 0;color:#94a3b8;font-size:11px;line-height:1.7;">
                    HHS will never ask you to send your password,
                    OTP or payment credentials by email.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:18px 34px;border-top:1px solid #e2e8f0;color:#94a3b8;background:#f8fafc;font-size:11px;text-align:center;">
                  © ${new Date().getFullYear()}
                  VeeraWebTech · Hogenakkal Home Stays
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};

/* =====================================
   Password-reset email
===================================== */

export const sendPasswordResetEmail =
  async ({
    user,
    resetToken,
    expiresInMinutes = 15,
  }) => {
    const resetUrl =
      `${getFrontendUrl()}/reset-password/` +
      encodeURIComponent(
        resetToken
      );

    return sendEmailSafely({
      to: user.email,

      subject:
        "Reset your HHS password",

      text:
        `Hello ${user.fullName},\n\n` +
        "We received a request to reset your HHS password.\n\n" +
        `Open this link within ${expiresInMinutes} minutes:\n${resetUrl}\n\n` +
        "If you did not request this reset, ignore this email.",

      html: createEmailLayout({
        preview:
          "Use this secure link to reset your HHS password.",

        heading:
          "Reset your password",

        message:
          `Hello ${user.fullName}, we received a request to reset your password. ` +
          `This secure link expires in ${expiresInMinutes} minutes and can be used only once.`,

        buttonText:
          "Reset Password",

        buttonUrl:
          resetUrl,

        securityMessage:
          "If you did not request this password reset, you can safely ignore this email. Your existing password will remain unchanged.",
      }),
    });
  };

/* =====================================
   Password-changed notification
===================================== */

export const sendPasswordChangedEmail =
  async ({
    user,
  }) => {
    return sendEmailSafely({
      to: user.email,

      subject:
        "Your HHS password was changed",

      text:
        `Hello ${user.fullName}, your HHS account password was changed successfully. ` +
        "If you did not make this change, contact HHS support immediately.",

      html: createEmailLayout({
        preview:
          "Your HHS password was changed.",

        heading:
          "Password changed successfully",

        message:
          `Hello ${user.fullName}, the password for your HHS account was changed successfully. ` +
          "Previously issued login sessions have been invalidated.",

        buttonText:
          "Contact Support",

        buttonUrl:
          `${getFrontendUrl()}/contact`,

        securityMessage:
          "If you did not make this change, contact HHS support immediately at hogenakkalhomestays@gmail.com.",
      }),
    });
  };