import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../models/User.js";

dotenv.config();

/* =====================================
   Create or reset Super Admin
===================================== */

const createSuperAdmin = async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI;

    const fullName =
      process.env.SUPER_ADMIN_NAME
        ?.trim();

    const email =
      process.env.SUPER_ADMIN_EMAIL
        ?.trim()
        .toLowerCase();

    const phone =
      process.env.SUPER_ADMIN_PHONE
        ?.trim();

    const password =
      process.env.SUPER_ADMIN_PASSWORD;

    if (!mongoUri) {
      throw new Error(
        "MONGO_URI is missing from backend .env"
      );
    }

    if (
      !fullName ||
      !email ||
      !phone ||
      !password
    ) {
      throw new Error(
        "Super Admin environment variables are incomplete."
      );
    }

    if (password.length < 8) {
      throw new Error(
        "Super Admin password must contain at least 8 characters."
      );
    }

    await mongoose.connect(mongoUri);

    console.log(
      "MongoDB connected successfully."
    );

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    const existingUser =
      await User.findOne({
        email,
      }).select("+password");

    if (existingUser) {
      existingUser.fullName =
        fullName;

      existingUser.phone =
        phone;

      existingUser.password =
        hashedPassword;

      existingUser.role =
        "super_admin";

      existingUser.isActive =
        true;

      existingUser.isVerified =
        true;

      await existingUser.save();

      console.log(
        "Existing account updated as Super Admin."
      );
    } else {
      await User.create({
        fullName,
        email,
        phone,
        password:
          hashedPassword,
        role: "super_admin",
        isActive: true,
        isVerified: true,
      });

      console.log(
        "Super Admin created successfully."
      );
    }

    console.log(
      `Super Admin email: ${email}`
    );
  } catch (error) {
    console.error(
      "Super Admin setup failed:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();

    console.log(
      "MongoDB connection closed."
    );
  }
};

createSuperAdmin();