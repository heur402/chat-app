import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    callType: {
      type: String,
      enum: ["audio", "video"],
      required: true,
    },
    status: {
      type: String,
      enum: ["missed", "completed", "rejected", "ongoing"],
      default: "ongoing",
    },
    duration: {
      type: Number,
      default: 0, // in seconds
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: Date,
  },
  { timestamps: true }
);

export const CallLog = mongoose.model("CallLog", callLogSchema);