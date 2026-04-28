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

// ========== VERCEL-SPECIFIC CORS CONFIGURATION ==========
const FRONTEND_URL = process.env.FRONTEND_URL || "https://chat-app-lime-chi-87.vercel.app";

// Critical: Handle preflight requests BEFORE any other middleware
app.use((req, res, next) => {
  // Set CORS headers for ALL responses
  res.header('Access-Control-Allow-Origin', FRONTEND_URL);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, token, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Expose-Headers', 'Content-Length, X-Requested-With');
  
  // Handle preflight OPTIONS request immediately
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Socket.io with CORS
export const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "token"],
    transports: ["websocket", "polling"],
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Store connected users and their call status
export const userSocketMap = {};
export const userCallStatus = {};

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

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("callUser", ({ fromUserId, toUserId, signalData, callType }) => {
    const receiverSocketId = userSocketMap[toUserId];
    const callerSocketId = userSocketMap[fromUserId];
    
    if (!receiverSocketId) {
      socket.emit("callError", { message: "User is offline" });
      return;
    }
    
    if (userCallStatus[toUserId]?.inCall) {
      socket.emit("callError", { message: "User is already in a call" });
      return;
    }
    
    if (userCallStatus[fromUserId]?.inCall) {
      socket.emit("callError", { message: "You are already in a call" });
      return;
    }
    
    userCallStatus[fromUserId] = { inCall: true, withUserId: toUserId };
    userCallStatus[toUserId] = { inCall: true, withUserId: fromUserId };
    
    io.to(receiverSocketId).emit("incomingCall", {
      fromUserId,
      fromUserInfo: socket.handshake.query.userInfo ? JSON.parse(socket.handshake.query.userInfo) : null,
      signal: signalData,
      callType,
      callId: Date.now().toString(),
    });
    
    console.log(`📞 Call initiated from ${fromUserId} to ${toUserId} (${callType})`);
  });

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

  socket.on("rejectCall", ({ fromUserId, toUserId }) => {
    const callerSocketId = userSocketMap[fromUserId];
    if (callerSocketId) {
      io.to(callerSocketId).emit("callRejected", {
        toUserId,
        message: "User rejected the call",
      });
      
      if (userCallStatus[fromUserId]) {
        userCallStatus[fromUserId] = { inCall: false, withUserId: null };
      }
      if (userCallStatus[toUserId]) {
        userCallStatus[toUserId] = { inCall: false, withUserId: null };
      }
      
      console.log(`❌ Call rejected from ${toUserId} to ${fromUserId}`);
    }
  });

  socket.on("iceCandidate", ({ toUserId, candidate }) => {
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("iceCandidate", { candidate });
    }
  });

  socket.on("endCall", ({ toUserId, callDuration }) => {
    const fromUserId = Object.keys(userSocketMap).find(
      (key) => userSocketMap[key] === socket.id
    );
    
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callEnded", { callDuration });
    }
    
    if (fromUserId && userCallStatus[fromUserId]) {
      userCallStatus[fromUserId] = { inCall: false, withUserId: null };
    }
    if (toUserId && userCallStatus[toUserId]) {
      userCallStatus[toUserId] = { inCall: false, withUserId: null };
    }
    
    console.log(`📞 Call ended between ${fromUserId} and ${toUserId}`);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", userId);
    
    if (userId && userCallStatus[userId]?.inCall) {
      const otherUserId = userCallStatus[userId].withUserId;
      if (otherUserId && userSocketMap[otherUserId]) {
        io.to(userSocketMap[otherUserId]).emit("callEnded", { 
          message: "User disconnected unexpectedly" 
        });
        
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

// Test route
app.get("/api/status", (req, res) => {
  res.json({ 
    status: "✅ Server is live on Vercel",
    cors: "enabled",
    frontend: FRONTEND_URL,
    timestamp: new Date().toISOString()
  });
});

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

// Export for Vercel serverless
export default app;

// Only listen when not on Vercel (local development)
if (process.env.NODE_ENV !== 'production') {
  const startServer = async () => {
    try {
      await connectDB();
      const PORT = process.env.PORT || 5000;
      server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 WebSocket server ready for calls`);
        console.log(`🔗 CORS enabled for: ${FRONTEND_URL}`);
      });
    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  };
  
  startServer();
} else {
  // For Vercel, just connect to DB but don't listen on a port
  connectDB().catch(console.error);
}