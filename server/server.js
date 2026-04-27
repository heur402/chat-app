import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutescopy.js";
import callRouter from "./routes/callRoutes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// =========================
// 🌐 ALLOWED FRONTEND ORIGINS
// =========================
const allowedOrigins = [
  "http://localhost:5173",
  "https://chat-app-lime-chi-87.vercel.app",
];

// =========================
// 🔥 GLOBAL CORS FIX (IMPORTANT)
// =========================
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// =========================
// EXPRESS MIDDLEWARE
// =========================
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// =========================
// SOCKET.IO SETUP
// =========================
export const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// =========================
// SOCKET USER STORAGE
// =========================
export const userSocketMap = {};
export const userCallStatus = {};

// =========================
// SOCKET CONNECTION
// =========================
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

  // =========================
  // CALL USER
  // =========================
  socket.on("callUser", ({ fromUserId, toUserId, signalData, callType }) => {
    const receiverSocketId = userSocketMap[toUserId];

    if (!receiverSocketId) {
      return socket.emit("callError", { message: "User is offline" });
    }

    if (userCallStatus[toUserId]?.inCall) {
      return socket.emit("callError", { message: "User is already in a call" });
    }

    if (userCallStatus[fromUserId]?.inCall) {
      return socket.emit("callError", { message: "You are already in a call" });
    }

    userCallStatus[fromUserId] = { inCall: true, withUserId: toUserId };
    userCallStatus[toUserId] = { inCall: true, withUserId: fromUserId };

    io.to(receiverSocketId).emit("incomingCall", {
      fromUserId,
      signal: signalData,
      callType,
      callId: Date.now().toString(),
    });
  });

  // =========================
  // ACCEPT CALL
  // =========================
  socket.on("acceptCall", ({ fromUserId, toUserId, signalData }) => {
    const callerSocketId = userSocketMap[fromUserId];

    if (callerSocketId) {
      io.to(callerSocketId).emit("callAccepted", {
        toUserId,
        signal: signalData,
      });
    }
  });

  // =========================
  // REJECT CALL
  // =========================
  socket.on("rejectCall", ({ fromUserId, toUserId }) => {
    const callerSocketId = userSocketMap[fromUserId];

    if (callerSocketId) {
      io.to(callerSocketId).emit("callRejected");

      userCallStatus[fromUserId] = { inCall: false, withUserId: null };
      userCallStatus[toUserId] = { inCall: false, withUserId: null };
    }
  });

  // =========================
  // ICE CANDIDATE
  // =========================
  socket.on("iceCandidate", ({ toUserId, candidate }) => {
    const receiverSocketId = userSocketMap[toUserId];

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("iceCandidate", { candidate });
    }
  });

  // =========================
  // END CALL
  // =========================
  socket.on("endCall", ({ toUserId, callDuration }) => {
    const fromUserId = Object.keys(userSocketMap).find(
      (key) => userSocketMap[key] === socket.id
    );

    const receiverSocketId = userSocketMap[toUserId];

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callEnded", { callDuration });
    }

    if (fromUserId) {
      userCallStatus[fromUserId] = { inCall: false, withUserId: null };
    }
    if (toUserId) {
      userCallStatus[toUserId] = { inCall: false, withUserId: null };
    }
  });

  // =========================
  // DISCONNECT
  // =========================
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", userId);

    if (userId && userCallStatus[userId]?.inCall) {
      const otherUserId = userCallStatus[userId].withUserId;

      if (otherUserId && userSocketMap[otherUserId]) {
        io.to(userSocketMap[otherUserId]).emit("callEnded");
        userCallStatus[otherUserId] = { inCall: false, withUserId: null };
      }
    }

    delete userSocketMap[userId];
    delete userCallStatus[userId];

    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

// =========================
// ROUTES
// =========================
app.get("/api/status", (req, res) => {
  res.send("✅ Server is live");
});

app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/calls", callRouter);

// =========================
// ERROR HANDLING
// =========================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// =========================
// START SERVER
// =========================
const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 5000;

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 WebSocket ready`);
    });
  } catch (err) {
    console.error("Server failed:", err);
    process.exit(1);
  }
};

startServer();