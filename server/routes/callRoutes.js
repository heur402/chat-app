import express from "express";
import { CallLog } from "../models/callLogModel.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get call history for a user
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const calls = await CallLog.find({
      $or: [{ callerId: req.userId }, { receiverId: req.userId }],
    })
      .populate("callerId", "fullName profilePic")
      .populate("receiverId", "fullName profilePic")
      .sort({ startedAt: -1 })
      .limit(50);
    
    res.json(calls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Save call log after call ends
router.post("/log", authMiddleware, async (req, res) => {
  try {
    const { callerId, receiverId, callType, status, duration } = req.body;
    
    const callLog = new CallLog({
      callerId,
      receiverId,
      callType,
      status,
      duration,
      endedAt: new Date(),
    });
    
    await callLog.save();
    res.status(201).json(callLog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;