import ContactEnquiry from "../models/ContactEnquiry.js";

/* =====================================
   Helper functions
===================================== */

const cleanValue = (value) => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const getRequestIp = (req) => {
  const forwardedIp =
    req.headers["x-forwarded-for"];

  if (typeof forwardedIp === "string") {
    return (
      forwardedIp
        .split(",")[0]
        ?.trim() || ""
    );
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    ""
  );
};

/* =====================================
   Create public contact enquiry
===================================== */

export const createContactEnquiry =
  async (req, res) => {
    try {
      const name =
        cleanValue(req.body.name);

      const email =
        cleanValue(
          req.body.email
        ).toLowerCase();

      const phone =
        cleanValue(req.body.phone);

      const message =
        cleanValue(req.body.message);

      if (
        !name ||
        !email ||
        !phone ||
        !message
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Name, email, phone number and message are required.",
        });
      }

      if (name.length < 2) {
        return res.status(400).json({
          success: false,
          message:
            "Name must contain at least 2 characters.",
        });
      }

      if (name.length > 100) {
        return res.status(400).json({
          success: false,
          message:
            "Name cannot exceed 100 characters.",
        });
      }

      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(email)) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid email address.",
        });
      }

      const phoneDigits =
        phone.replace(/\D/g, "");

      if (
        phoneDigits.length < 10 ||
        phoneDigits.length > 15
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid phone number.",
        });
      }

      if (message.length < 10) {
        return res.status(400).json({
          success: false,
          message:
            "Message must contain at least 10 characters.",
        });
      }

      if (message.length > 3000) {
        return res.status(400).json({
          success: false,
          message:
            "Message cannot exceed 3000 characters.",
        });
      }

      const enquiry =
        await ContactEnquiry.create({
          name,
          email,
          phone,
          message,
          source: "website",
          ipAddress:
            getRequestIp(req),
          userAgent:
            cleanValue(
              req.headers[
                "user-agent"
              ]
            ).slice(0, 500),
        });

      return res.status(201).json({
        success: true,
        message:
          "Thank you! Your enquiry has been submitted successfully. Our team will contact you shortly.",

        enquiry: {
          id: enquiry._id,
          enquiryReference:
            enquiry.enquiryReference,
          name: enquiry.name,
          email: enquiry.email,
          phone: enquiry.phone,
          status: enquiry.status,
          createdAt:
            enquiry.createdAt,
        },
      });
    } catch (error) {
      console.error(
        "Create contact enquiry error:",
        error
      );

      if (
        error.name ===
        "ValidationError"
      ) {
        const validationMessage =
          Object.values(
            error.errors
          )
            .map(
              (item) =>
                item.message
            )
            .join(" ");

        return res.status(400).json({
          success: false,
          message:
            validationMessage ||
            "Enquiry validation failed.",
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "The enquiry reference already exists. Please submit again.",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Unable to submit your enquiry. Please try again.",
      });
    }
  };