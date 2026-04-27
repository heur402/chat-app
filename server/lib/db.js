import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    // connect directly — don't append the DB name with a slash
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1); // stop the app if DB connection fails
  }

  // Optional: handle disconnection events
  mongoose.connection.on("disconnected", () => {
    console.log("⚠️ MongoDB disconnected");
  });
};
