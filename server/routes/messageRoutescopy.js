import express from "express";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middleware/auth.js";
import {
  getMessages,
  getUserForSidebar,
  markMessageAsSeen,
  sendMessage,
  updateMessageStatus,
} from "../controllers/messageController.js";

const messageRouter = express.Router();

// Message rate limiting (30 messages per minute per user)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  keyGenerator: (req) =>
    req.user?.id?.toString() ?? req.user?._id?.toString(),
  message: "Message rate limit exceeded. Please slow down.",
  skip: (req) => !req.user, // Skip if not authenticated
});

messageRouter.get("/users", protectRoute, getUserForSidebar);
messageRouter.get("/:id", protectRoute, getMessages);
messageRouter.put("/mark/:id", protectRoute, markMessageAsSeen);
messageRouter.put("/status/:id", protectRoute, updateMessageStatus);
messageRouter.post("/send/:id", protectRoute, messageLimiter, sendMessage);

export default messageRouter