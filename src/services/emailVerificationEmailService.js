import {
  sendEmailSafely,
} from "./emailService.js";

/* =====================================
   Configuration helpers
===================================== */

const getFrontendUrl = () => {
  const configuredFrontend =
    (
      process.env.FRONTEND_URL ||
      "https://hogenakkalhomestays.com/"
    )
      .split(",")[0]
      .trim();

  return configuredFrontend
    .replace(/\/+$/, "");
};

/* =====================================
   Escape user-provided HTML
===================================== */

const escapeHtml = (
  value
) => {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

/* =====================================
   Shared email wrapper
===================================== */

const createEmailTemplate = ({
  preview,
  heading,
  greeting,
  message,
  buttonText,
  buttonUrl,
  footerMessage,
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

    <body
      style="
        margin:0;
        padding:0;
        background:#eef6f8;
        font-family:Arial,Helvetica,sans-serif;
      "
    >
      <div
        style="
          display:none;
          max-height:0;
          overflow:hidden;
          opacity:0;
        "
      >
        ${escapeHtml(preview)}
      </div>

      <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        style="
          width:100%;
          background:#eef6f8;
        "
      >
        <tr>
          <td
            align="center"
            style="
              padding:35px 16px;
            "
          >
            <table
              role="presentation"
              width="100%"
              cellspacing="0"
              cellpadding="0"
              style="
                width:100%;
                max-width:620px;
                overflow:hidden;
                border:1px solid #dbe8ec;
                border-radius:20px;
                background:#ffffff;
                box-shadow:0 18px 45px rgba(15,35,50,0.09);
              "
            >
              <tr>
                <td
                  style="
                    padding:28px 34px;
                    background:linear-gradient(135deg,#0e7490,#06b6d4);
                  "
                >
                  <div
                    style="
                      color:#cffafe;
                      font-size:11px;
                      font-weight:700;
                      letter-spacing:1.5px;
                      text-transform:uppercase;
                    "
                  >
                    Hogenakkal Home Stays
                  </div>

                  <div
                    style="
                      margin-top:8px;
                      color:#ffffff;
                      font-size:25px;
                      font-weight:800;
                      line-height:1.25;
                    "
                  >
                    ${escapeHtml(heading)}
                  </div>
                </td>
              </tr>

              <tr>
                <td
                  style="
                    padding:34px;
                  "
                >
                  <p
                    style="
                      margin:0;
                      color:#102235;
                      font-size:16px;
                      font-weight:700;
                    "
                  >
                    ${escapeHtml(greeting)}
                  </p>

                  <p
                    style="
                      margin:17px 0 0;
                      color:#526b7b;
                      font-size:14px;
                      line-height:1.75;
                    "
                  >
                    ${escapeHtml(message)}
                  </p>

                  ${
                    buttonText &&
                    buttonUrl
                      ? `
                        <table
                          role="presentation"
                          cellspacing="0"
                          cellpadding="0"
                          style="
                            margin:27px 0;
                          "
                        >
                          <tr>
                            <td>
                              <a
                                href="${escapeHtml(buttonUrl)}"
                                target="_blank"
                                rel="noopener noreferrer"
                                style="
                                  display:inline-block;
                                  padding:14px 24px;
                                  border-radius:11px;
                                  color:#ffffff;
                                  background:#0891b2;
                                  text-decoration:none;
                                  font-size:13px;
                                  font-weight:800;
                                "
                              >
                                ${escapeHtml(buttonText)}
                              </a>
                            </td>
                          </tr>
                        </table>
                      `
                      : ""
                  }

                  ${
                    buttonUrl
                      ? `
                        <p
                          style="
                            margin:0;
                            color:#8292a2;
                            font-size:11px;
                            line-height:1.65;
                          "
                        >
                          If the button does not work,
                          copy and paste this link into
                          your browser:
                        </p>

                        <p
                          style="
                            margin:8px 0 0;
                            overflow-wrap:anywhere;
                            color:#0e7490;
                            font-size:11px;
                            line-height:1.65;
                          "
                        >
                          ${escapeHtml(buttonUrl)}
                        </p>
                      `
                      : ""
                  }

                  <div
                    style="
                      margin-top:27px;
                      padding:15px;
                      border:1px solid #dbe8ec;
                      border-radius:12px;
                      color:#64748b;
                      background:#f8fbfc;
                      font-size:11px;
                      line-height:1.65;
                    "
                  >
                    ${escapeHtml(footerMessage)}
                  </div>
                </td>
              </tr>

              <tr>
                <td
                  style="
                    padding:20px 34px;
                    border-top:1px solid #e7eef1;
                    color:#8292a2;
                    background:#f8fbfc;
                    text-align:center;
                    font-size:10px;
                    line-height:1.6;
                  "
                >
                  HHS – Hogenakkal Home Stays<br />
                  Operated by VeeraWebTech
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
   Send verification email
===================================== */

export const sendEmailVerificationEmail =
  async ({
    email,
    fullName,
    token,
  }) => {
    console.log("Sending verification email to:", email, "with token:", token, "and fullName:", fullName);
    if (
      !email ||
      !token
    ) {
      return {
        success: false,

        error:
          "Verification email information is incomplete.",
      };
    }

    const verificationUrl =
      `${getFrontendUrl()}/verify-email/` +
      encodeURIComponent(token);
    console.log("Verification URL:", verificationUrl);
    const customerName =
      fullName?.trim() ||
      "HHS Guest";
   console.log("Customer Name:", customerName);
    const text = [
      `Hello ${customerName},`,
      "",
      "Welcome to Hogenakkal Home Stays.",
      "",
      "Verify your email address using the following link:",
      verificationUrl,
      "",
      "This verification link expires automatically.",
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n");
    console.log("Email text content:", text);
    const html =
      createEmailTemplate({
        preview:
          "Verify your HHS email address.",

        heading:
          "Verify your email address",

        greeting:
          `Hello ${customerName},`,

        message:
          "Welcome to Hogenakkal Home Stays. Please verify your email address to activate and secure your customer account.",

        buttonText:
          "Verify Email Address",

        buttonUrl:
          verificationUrl,

        footerMessage:
          "This verification link expires automatically and can only be used once. If you did not create this HHS account, you can safely ignore this email.",
      });
    console.log("Email HTML content:", html);
    return sendEmailSafely({
      to: email,

      subject:
        "Verify your HHS email address",

      text,

      html,
    });
  };

/* =====================================
   Send verification confirmation
===================================== */

export const sendEmailVerifiedEmail =
  async ({
    email,
    fullName,
  }) => {
    if (!email) {
      return {
        success: false,

        error:
          "Verification confirmation recipient is missing.",
      };
    }

    const customerName =
      fullName?.trim() ||
      "HHS Guest";

    const exploreUrl =
      `${getFrontendUrl()}/explore`;

    const text = [
      `Hello ${customerName},`,
      "",
      "Your HHS email address has been verified successfully.",
      "",
      "You can now log in and explore available properties:",
      exploreUrl,
    ].join("\n");

    const html =
      createEmailTemplate({
        preview:
          "Your HHS email address is verified.",

        heading:
          "Email verification successful",

        greeting:
          `Hello ${customerName},`,

        message:
          "Your email address has been verified successfully. Your HHS account is now ready to use.",

        buttonText:
          "Explore HHS Properties",

        buttonUrl:
          exploreUrl,

        footerMessage:
          "Thank you for choosing Hogenakkal Home Stays. You can now access your account and explore trusted stays near Hogenakkal Falls.",
      });

      const emailResult = await sendEmailSafely({ to: email, subject: "Your HHS email is verified", text });
console.log("Email Result:", emailResult); // Check if success is false here
return res.status(200).json({ success: true });

    // return sendEmailSafely({
    //   to: email,

    //   subject:
    //     "Your HHS email is verified",

    //   text,

    //   html,
    // });
  };