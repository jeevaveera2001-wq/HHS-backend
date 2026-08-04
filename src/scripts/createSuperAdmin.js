import mongoose from "mongoose";

// The correct, full connection string
const MONGO_URI = "mongodb+srv://hogenakkalhomestays_db_user:Hacker123@hhs-db.e67t8um.mongodb.net/hhs?retryWrites=true&w=majority&appName=HHS-DB";

const setupAdmin = async () => {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB Atlas");

    // Access the database collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection("users"); 

    // Find the user and update their role
    const result = await usersCollection.updateOne(
      { email: "hogenakkalhomestays@gmail.com" }, 
      {
        $set: {
          role: "super_admin",
          isVerified: true 
        }
      }
    );

    // Output the result
    if (result.modifiedCount > 0) {
      console.log("🎉 SUCCESS: User successfully upgraded to super_admin!");
    } else if (result.matchedCount > 0) {
      console.log("⚠️ User found, but they are already a super_admin.");
    } else {
      console.log("❌ ERROR: User not found. Please register the account on your website first.");
    }

    // Disconnect and exit
    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error("FATAL ERROR:", error);
    process.exit(1);
  }
};

setupAdmin();