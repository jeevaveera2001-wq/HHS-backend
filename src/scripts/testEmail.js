import "dotenv/config";

import nodemailer from "nodemailer";

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

const runEmailTest =
  async () => {
    let transporter;

    try {
      const smtpHost =
        process.env.SMTP_HOST?.trim();

      const smtpUser =
        process.env.SMTP_USER?.trim();

      const smtpPassword =
        process.env.SMTP_PASS?.trim();

      const smtpPort =
        Number(
          process.env.SMTP_PORT
        ) || 465;

      const smtpSecure =
        normalizeBoolean(
          process.env.SMTP_SECURE,
          smtpPort === 465
        );

      const recipient =
        process.env.EMAIL_TEST_TO?.trim() ||
        smtpUser;

      if (
        !smtpHost ||
        !smtpUser ||
        !smtpPassword
      ) {
        throw new Error(
          "SMTP_HOST, SMTP_USER and SMTP_PASS are required in the backend .env file."
        );
      }

      if (!recipient) {
        throw new Error(
          "EMAIL_TEST_TO or SMTP_USER is required in the backend .env file."
        );
      }

      transporter =
        nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,

          auth: {
            user: smtpUser,
            pass: smtpPassword,
          },

        });

      console.log(
        "Checking SMTP connection..."
      );

      await transporter.verify();

      console.log(
        "SMTP connection verified successfully."
      );

      const result =
        await transporter.sendMail({
          from: {
            name:
              process.env.MAIL_FROM_NAME?.trim() ||
              "HHS - Hogenakkal Home Stay",

            address:
              process.env.MAIL_FROM_EMAIL?.trim() ||
              smtpUser,
          },

          to: recipient,

          subject:
            "HHS email configuration test",

          text:
            "Your HHS backend email configuration is working correctly.",

          html: `
            <!doctype html>

            <html lang="en">
              <head>
                <meta charset="utf-8" />

                <meta
                  name="viewport"
                  content="width=device-width, initial-scale=1"
                />

                <title>
                  HHS Email Test
                </title>
              </head>

              <body
                style="
                  margin:0;
                  padding:30px;
                  background:#f1f5f9;
                  font-family:Arial,sans-serif;
                "
              >
                <div
                  style="
                    max-width:600px;
                    margin:auto;
                    overflow:hidden;
                    border-radius:18px;
                    background:#ffffff;
                    box-shadow:0 12px 30px rgba(15,23,42,0.08);
                  "
                >
                  <div
                    style="
                      padding:25px 30px;
                      color:#ffffff;
                      background:linear-gradient(135deg,#0e7490,#06b6d4);
                    "
                  >
                    <strong
                      style="
                        font-size:20px;
                      "
                    >
                      HHS
                    </strong>

                    <div
                      style="
                        margin-top:6px;
                        font-size:12px;
                      "
                    >
                      Hogenakkal Home Stay
                    </div>
                  </div>

                  <div
                    style="
                      padding:30px;
                    "
                  >
                    <h1
                      style="
                        margin:0;
                        color:#071827;
                        font-size:26px;
                      "
                    >
                      Email setup is working
                    </h1>

                    <p
                      style="
                        margin:15px 0 0;
                        color:#64748b;
                        font-size:14px;
                        line-height:1.7;
                      "
                    >
                      Your HHS backend successfully connected to Gmail SMTP and delivered this test email.
                    </p>

                    <p
                      style="
                        margin:25px 0 0;
                        color:#0891b2;
                        font-size:12px;
                        font-weight:700;
                      "
                    >
                      VeeraWebTech · HHS
                    </p>
                  </div>
                </div>
              </body>
            </html>
          `,
        });

      console.log(
        `Test email sent successfully to: ${recipient}`
      );

      console.log(
        `Message ID: ${result.messageId}`
      );
    } catch (error) {
      console.error(
        "Email test failed:",
        error.message
      );

      if (
        error.code === "EAUTH"
      ) {
        console.error(
          "Gmail rejected the login. Use a Google App Password, not the normal Gmail password."
        );
      }

      process.exitCode = 1;
    } finally {
      if (
        transporter?.close
      ) {
        transporter.close();
      }
    }
  };

runEmailTest();