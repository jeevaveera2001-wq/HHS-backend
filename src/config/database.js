import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log(
      "Attempting to connect to MongoDB at:",
      mongoUri
    );
    if (!mongoUri) {
      throw new Error(
        "MONGO_URI is missing from the backend .env file."
      );
    }

    const connection = await mongoose.connect(mongoUri);

    console.log(
      `MongoDB connected: ${connection.connection.host}`
    );

    return connection;
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error.message
    );

    throw error;
  }
};

export default connectDB;