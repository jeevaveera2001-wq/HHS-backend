import Razorpay from "razorpay";

let razorpayClient = null;

export const isRazorpayConfigured = () => {
  return Boolean(
    process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET
  );
};

export const getRazorpayKeyId = () => {
  return process.env.RAZORPAY_KEY_ID || "";
};

export const getRazorpayClient = () => {
  if (!isRazorpayConfigured()) {
    const error = new Error(
      "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );

    error.status = 503;
    throw error;
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret:
        process.env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpayClient;
};