import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutescopy.js";
import callRouter from "./routes/callRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envResult = dotenv.config({ path: path.join(__dirname, ".env") });
if (envResult.error && process.env.NODE_ENV !== "production") {
  console.warn(
    "No .env file loaded from server folder; relying on existing environment variables.",
  );
}

const requiredEnv = ["JWT_SECRET", "JWT_REFRESH_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(
    `Missing required environment variables: ${missingEnv.join(", ")}`,
  );
}

const app = express();
const server = http.createServer(app);

// ========== REDIS SETUP FOR SCALING ==========
let pubClient, subClient;
if (process.env.REDIS_URL) {
  pubClient = createClient({ url: process.env.REDIS_URL });
  subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()]).catch(console.error);
}

// ========== SECURITY MIDDLEWARE ==========
app.set(
  "trust proxy",
  process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production",
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        connectSrc: [
          "'self'",
          "wss:",
          "ws:",
          process.env.REDIS_URL
            ? new URL(process.env.REDIS_URL).origin
            : undefined,
        ].filter(Boolean),
      },
    },
  }),
);

// Global rate limiting for all requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ========== CORS CONFIGURATION ==========
// Remove trailing slashes from URLs
const normalizeUrl = (url) => {
  if (!url) return null;
  return url.replace(/\/$/, ""); // Remove trailing slash
};

const PRODUCTION_URL =
  normalizeUrl(process.env.FRONTEND_URL) ||
  "https://chat-app-lime-chi-87.vercel.app";
const LOCAL_URLS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
];

// Dynamic CORS - allows both localhost AND production
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;

  // Check if origin is allowed
  const isAllowed =
    origin && (origin === PRODUCTION_URL || LOCAL_URLS.includes(origin));

  if (isAllowed) {
    res.header("Access-Control-Allow-Origin", origin); // Use the actual origin, not hardcoded
  } else if (!origin) {
    // Allow requests with no origin (like mobile apps)
    res.header("Access-Control-Allow-Origin", "*");
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, token, X-Requested-With, Accept, Origin",
  );
  res.header(
    "Access-Control-Expose-Headers",
    "Content-Length, X-Requested-With",
  );

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
};

// Apply CORS middleware
app.use(corsMiddleware);

// Body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Socket.io with Redis adapter for horizontal scaling
export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin === PRODUCTION_URL || LOCAL_URLS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "token"],
  },
  transports: ["websocket", "polling"],
});

// Use Redis adapter if available
if (pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("🔴 Redis adapter enabled for Socket.io scaling");
}

// Your existing socket.io logic
export const userSocketMap = {};
export const userPresenceMap = {}; // Enhanced presence tracking
export const userCallStatus = {};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  const userInfo = socket.handshake.query.userInfo
    ? JSON.parse(socket.handshake.query.userInfo)
    : null;

  console.log("✅ User connected:", userId);

  if (userId) {
    userSocketMap[userId] = socket.id;
    userPresenceMap[userId] = {
      status: "online",
      lastSeen: new Date(),
      socketId: socket.id,
      userInfo,
    };

    if (!userCallStatus[userId]) {
      userCallStatus[userId] = { inCall: false, withUserId: null };
    }
  }

  // Heartbeat mechanism
  const heartbeat = setInterval(() => {
    socket.emit("ping", { timestamp: Date.now() });
  }, 30000); // Ping every 30 seconds

  socket.on("pong", (data) => {
    if (userId && userPresenceMap[userId]) {
      userPresenceMap[userId].lastSeen = new Date();
    }
  });

  // Presence status updates
  socket.on("updatePresence", (status) => {
    if (userId && userPresenceMap[userId]) {
      userPresenceMap[userId].status = status;
      userPresenceMap[userId].lastSeen = new Date();

      // Broadcast presence update to all connected clients
      io.emit("presenceUpdate", {
        userId,
        status,
        lastSeen: userPresenceMap[userId].lastSeen,
      });
    }
  });

  // Typing indicators
  socket.on("typing", (data) => {
    const { toUserId, isTyping } = data;
    const receiverSocketId = userSocketMap[toUserId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("userTyping", {
        fromUserId: userId,
        isTyping,
      });
    }
  });

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("callUser", ({ fromUserId, toUserId, signalData, callType }) => {
    const receiverSocketId = userSocketMap[toUserId];

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
      fromUserInfo: socket.handshake.query.userInfo
        ? JSON.parse(socket.handshake.query.userInfo)
        : null,
      signal: signalData,
      callType,
      callId: Date.now().toString(),
    });

    console.log(
      `📞 Call initiated from ${fromUserId} to ${toUserId} (${callType})`,
    );
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
      (key) => userSocketMap[key] === socket.id,
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
    clearInterval(heartbeat);

    if (userId) {
      // Set presence to offline but keep lastSeen
      if (userPresenceMap[userId]) {
        userPresenceMap[userId].status = "offline";
        userPresenceMap[userId].lastSeen = new Date();

        // Broadcast offline status
        io.emit("presenceUpdate", {
          userId,
          status: "offline",
          lastSeen: userPresenceMap[userId].lastSeen,
        });

        // Remove from presence map after 5 minutes of inactivity
        setTimeout(
          () => {
            if (
              userPresenceMap[userId] &&
              userPresenceMap[userId].status === "offline"
            ) {
              delete userPresenceMap[userId];
            }
          },
          5 * 60 * 1000,
        ); // 5 minutes
      }

      if (userCallStatus[userId]?.inCall) {
        const otherUserId = userCallStatus[userId].withUserId;
        if (otherUserId && userSocketMap[otherUserId]) {
          io.to(userSocketMap[otherUserId]).emit("callEnded", {
            message: "User disconnected unexpectedly",
          });

          if (userCallStatus[otherUserId]) {
            userCallStatus[otherUserId] = { inCall: false, withUserId: null };
          }
        }
      }

      delete userSocketMap[userId];
      delete userCallStatus[userId];
    }

    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

// Routes
app.get("/api/status", (req, res) => {
  res.json({ 
    status: "✅ Server live",
    cors: "enabled",
    allowedOrigins: [PRODUCTION_URL, ...LOCAL_URLS]
  });
});

app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/calls", callRouter);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Export for Vercel
export default app;

// Local development only
if (process.env.NODE_ENV !== 'production') {
  const startServer = async () => {
    try {
      await connectDB();
      const PORT = process.env.PORT || 5000;
      server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🔗 CORS enabled for production: ${PRODUCTION_URL}`);
        console.log(`🔗 CORS enabled for local: ${LOCAL_URLS.join(', ')}`);
      });
    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  };
  startServer();
} else {
  connectDB().catch(console.error);
}