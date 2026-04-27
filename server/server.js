import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutescopy.js";
import callRouter from "./routes/callRoutes.js";
import { authMiddleware } from "./middleware/authMiddleware.js";

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
export const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Store connected users and their call status
export const userSocketMap = {}; // { userId: socketId }
export const userCallStatus = {}; // { userId: { inCall: boolean, withUserId: string } }

// Handle Socket.io connections
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  console.log("✅ User connected:", userId);

  if (userId) {
    userSocketMap[userId] = socket.id;
    if (!userCallStatus[userId]) {
      userCallStatus[userId] = { inCall: false, withUserId: null };
    }
  }

  // Emit updated online users list
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Handle call initiation
  socket.on("callUser", ({ fromUserId, toUserId, signalData, callType }) => {
    const receiverSocketId = userSocketMap[toUserId];
    const callerSocketId = userSocketMap[fromUserId];
    
    // Check if receiver is online
    if (!receiverSocketId) {
      socket.emit("callError", { message: "User is offline" });
      return;
    }
    
    // Check if receiver is already in a call
    if (userCallStatus[toUserId]?.inCall) {
      socket.emit("callError", { message: "User is already in a call" });
      return;
    }
    
    // Check if caller is already in a call
    if (userCallStatus[fromUserId]?.inCall) {
      socket.emit("callError", { message: "You are already in a call" });
      return;
    }
    
    // Mark both users as in call
    userCallStatus[fromUserId] = { inCall: true, withUserId: toUserId };
    userCallStatus[toUserId] = { inCall: true, withUserId: fromUserId };
    
    // Send incoming call to receiver
    io.to(receiverSocketId).emit("incomingCall", {
      fromUserId,
      fromUserInfo: socket.handshake.query.userInfo ? JSON.parse(socket.handshake.query.userInfo) : null,
      signal: signalData,
      callType,
      callId: Date.now().toString(),
    });
    
    console.log(`📞 Call initiated from ${fromUserId} to ${toUserId} (${callType})`);
  });

  // Handle call acceptance
  socket.on("acceptCall", ({ fromUserId, toUserId, signalData }) => {
    const callerSocketId = userSocketMap[fromUserId];
    if (callerSocketId) {
      io.to(callerSocketId).emit("callAccepted", {
        toUserId,
        signal: signalData,
      });
      console.log(`✅ Call accepted from ${toUserId} to ${fromUserId}`);
    }
  });

  // Handle call rejection
  socket.on("rejectCall", ({ fromUserId, toUserId }) => {
    const callerSocketId = userSocketMap[fromUserId];
    if (callerSocketId) {
      io.to(callerSocketId).emit("callRejected", {
        toUserId,
        message: "User rejected the call",
      });
      
      // Reset call status
      if (userCallStatus[fromUserId]) {
        userCallStatus[fromUserId] = { inCall: false, withUserId: null };
      }
      if (userCallStatus[toUserId]) {
        userCallStatus[toUserId] = { inCall: false, withUserId: null };
      }
      
      console.log(`❌ Call rejected from ${toUserId} to ${fromUserId}`);
    }
  });

  // Handle ICE candidates for WebRTC
  socket.on("iceCandidate", ({ toUserId, candidate }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("iceCandidate", { candidate });
    }
  });

  // End call
  socket.on("endCall", ({ toUserId, callDuration }) => {
    const fromUserId = Object.keys(userSocketMap).find(
      (key) => userSocketMap[key] === socket.id
    );
    
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callEnded", { callDuration });
    }
    
    // Reset call status for both users
    if (fromUserId && userCallStatus[fromUserId]) {
      userCallStatus[fromUserId] = { inCall: false, withUserId: null };
    }
    if (toUserId && userCallStatus[toUserId]) {
      userCallStatus[toUserId] = { inCall: false, withUserId: null };
    }
    
    console.log(`📞 Call ended between ${fromUserId} and ${toUserId}`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", userId);
    
    // If user was in a call, notify the other party
    if (userId && userCallStatus[userId]?.inCall) {
      const otherUserId = userCallStatus[userId].withUserId;
      if (otherUserId && userSocketMap[otherUserId]) {
        io.to(userSocketMap[otherUserId]).emit("callEnded", { 
          message: "User disconnected unexpectedly" 
        });
        
        // Reset other user's call status
        if (userCallStatus[otherUserId]) {
          userCallStatus[otherUserId] = { inCall: false, withUserId: null };
        }
      }
    }
    
    delete userSocketMap[userId];
    delete userCallStatus[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

// Middleware setup
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Test route
app.get("/api/status", (req, res) => res.send("✅ Server is live"));

// Main routes
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/calls", callRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 WebSocket server ready for calls`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();