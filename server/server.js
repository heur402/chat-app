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

// ========== PRODUCTION CORS SETUP (MUST BE FIRST) ==========
const PRODUCTION_URL = process.env.FRONTEND_URL?.replace(/\/$/, "") || 
  "https://chat-app-lime-chi-87.vercel.app";

const allowedOrigins = [
  PRODUCTION_URL,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
];

// CORS configuration for Express
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "token", 
    "X-Requested-With", 
    "Accept", 
    "Origin"
  ],
  exposedHeaders: ["Content-Length", "X-Requested-With"],
  maxAge: 86400, // Cache preflight for 24 hours
};

// Apply CORS BEFORE all other middleware
app.use(cors(corsOptions));

// Handle preflight requests for ALL routes (Vercel-compatible)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    // Explicitly set CORS headers for preflight
    const origin = req.headers.origin;
    
    if (!origin || allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin || "*");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, PATCH"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, token, X-Requested-With, Accept, Origin"
      );
      res.header("Access-Control-Max-Age", "86400");
      return res.status(204).send();
    }
  }
  next();
});

// ========== SECURITY MIDDLEWARE ==========
app.set(
  "trust proxy",
  process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production",
);

// Configure Helmet without CSP conflicts
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: [
          "'self'",
          "wss:",
          "ws:",
          PRODUCTION_URL,
          ...(process.env.REDIS_URL ? [new URL(process.env.REDIS_URL).origin] : []),
        ].filter(Boolean),
      },
    } : false, // Disable CSP in development to avoid issues
  }),
);

// Rate limiting - EXCLUDE OPTIONS requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS", // Skip rate limiting for preflight
});

app.use(limiter);

// Body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health check endpoint (useful for Vercel)
app.get("/api/status", (req, res) => {
  res.json({ 
    status: "✅ Server live",
    cors: "enabled",
    environment: process.env.NODE_ENV || "development",
    allowedOrigins,
    timestamp: new Date().toISOString()
  });
});

// ========== SOCKET.IO SETUP ==========
export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Same logic as Express CORS
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
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
  allowEIO3: true, // Support older client versions
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Use Redis adapter if available
if (pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("🔴 Redis adapter enabled for Socket.io scaling");
}

// ========== SOCKET.IO CONNECTION HANDLING ==========
export const userSocketMap = new Map(); // userId -> Set of socketIds
export const userPresenceMap = new Map(); // userId -> presence info
export const userCallStatus = new Map(); // userId -> call status

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  const userInfo = socket.handshake.query.userInfo
    ? JSON.parse(socket.handshake.query.userInfo)
    : null;

  console.log("✅ User connected:", userId, "Socket:", socket.id);

  if (userId) {
    // Add socket to user's socket set
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    userSocketMap.get(userId).add(socket.id);

    // Update presence
    userPresenceMap.set(userId, {
      status: "online",
      lastSeen: new Date(),
      socketIds: Array.from(userSocketMap.get(userId)),
      userInfo,
    });

    // Initialize call status if not exists
    if (!userCallStatus.has(userId)) {
      userCallStatus.set(userId, { inCall: false, withUserId: null });
    }

    // Broadcast presence update
    io.emit("presenceUpdate", {
      userId,
      status: "online",
      lastSeen: userPresenceMap.get(userId).lastSeen,
    });

    // Send current online users
    io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
  }

  // Heartbeat mechanism
  const heartbeat = setInterval(() => {
    socket.emit("ping", { timestamp: Date.now() });
  }, 30000);

  socket.on("pong", (data) => {
    if (userId && userPresenceMap.has(userId)) {
      userPresenceMap.get(userId).lastSeen = new Date();
    }
  });

  // Presence status updates
  socket.on("updatePresence", (status) => {
    if (userId && userPresenceMap.has(userId)) {
      userPresenceMap.get(userId).status = status;
      userPresenceMap.get(userId).lastSeen = new Date();

      io.emit("presenceUpdate", {
        userId,
        status,
        lastSeen: userPresenceMap.get(userId).lastSeen,
      });
    }
  });

  // Typing indicators
  socket.on("typing", (data) => {
    const { toUserId, isTyping } = data;
    const receiverSockets = userSocketMap.get(toUserId);
    if (receiverSockets && receiverSockets.size > 0) {
      receiverSockets.forEach(socketId => {
        io.to(socketId).emit("userTyping", {
          fromUserId: userId,
          isTyping,
        });
      });
    }
  });

  // Call handling
  socket.on("callUser", ({ fromUserId, toUserId, signalData, callType }) => {
    const receiverSockets = userSocketMap.get(toUserId);

    if (!receiverSockets || receiverSockets.size === 0) {
      socket.emit("callError", { message: "User is offline" });
      return;
    }

    const callStatus = userCallStatus.get(toUserId);
    if (callStatus?.inCall) {
      socket.emit("callError", { message: "User is already in a call" });
      return;
    }

    const fromCallStatus = userCallStatus.get(fromUserId);
    if (fromCallStatus?.inCall) {
      socket.emit("callError", { message: "You are already in a call" });
      return;
    }

    userCallStatus.set(fromUserId, { inCall: true, withUserId: toUserId });
    userCallStatus.set(toUserId, { inCall: true, withUserId: fromUserId });

    receiverSockets.forEach(socketId => {
      io.to(socketId).emit("incomingCall", {
        fromUserId,
        fromUserInfo: userInfo,
        signal: signalData,
        callType,
        callId: Date.now().toString(),
      });
    });

    console.log(`📞 Call initiated from ${fromUserId} to ${toUserId} (${callType})`);
  });

  socket.on("acceptCall", ({ fromUserId, toUserId, signalData }) => {
    const callerSockets = userSocketMap.get(fromUserId);
    if (callerSockets && callerSockets.size > 0) {
      callerSockets.forEach(socketId => {
        io.to(socketId).emit("callAccepted", {
          toUserId,
          signal: signalData,
        });
      });
      console.log(`✅ Call accepted from ${toUserId} to ${fromUserId}`);
    }
  });

  socket.on("rejectCall", ({ fromUserId, toUserId }) => {
    const callerSockets = userSocketMap.get(fromUserId);
    if (callerSockets && callerSockets.size > 0) {
      callerSockets.forEach(socketId => {
        io.to(socketId).emit("callRejected", {
          toUserId,
          message: "User rejected the call",
        });
      });

      userCallStatus.set(fromUserId, { inCall: false, withUserId: null });
      userCallStatus.set(toUserId, { inCall: false, withUserId: null });

      console.log(`❌ Call rejected from ${toUserId} to ${fromUserId}`);
    }
  });

  socket.on("iceCandidate", ({ toUserId, candidate }) => {
    const receiverSockets = userSocketMap.get(toUserId);
    if (receiverSockets && receiverSockets.size > 0) {
      receiverSockets.forEach(socketId => {
        io.to(socketId).emit("iceCandidate", { candidate });
      });
    }
  });

  socket.on("endCall", ({ toUserId, callDuration }) => {
    const fromUserId = userId; // Assuming socket belongs to fromUserId

    const receiverSockets = userSocketMap.get(toUserId);
    if (receiverSockets && receiverSockets.size > 0) {
      receiverSockets.forEach(socketId => {
        io.to(socketId).emit("callEnded", { callDuration });
      });
    }

    if (fromUserId && userCallStatus.has(fromUserId)) {
      userCallStatus.set(fromUserId, { inCall: false, withUserId: null });
    }
    if (toUserId && userCallStatus.has(toUserId)) {
      userCallStatus.set(toUserId, { inCall: false, withUserId: null });
    }

    console.log(`📞 Call ended between ${fromUserId} and ${toUserId}`);
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", userId, "Socket:", socket.id);
    clearInterval(heartbeat);

    if (userId) {
      const userSockets = userSocketMap.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);

        // If no more sockets, mark as offline
        if (userSockets.size === 0) {
          userSocketMap.delete(userId);

          if (userPresenceMap.has(userId)) {
            userPresenceMap.get(userId).status = "offline";
            userPresenceMap.get(userId).lastSeen = new Date();

            io.emit("presenceUpdate", {
              userId,
              status: "offline",
              lastSeen: userPresenceMap.get(userId).lastSeen,
            });

            // Clean up presence after 5 minutes
            setTimeout(() => {
              if (userPresenceMap.has(userId) && userPresenceMap.get(userId).status === "offline") {
                userPresenceMap.delete(userId);
              }
            }, 5 * 60 * 1000);
          }

          // Handle ongoing calls
          const callStatus = userCallStatus.get(userId);
          if (callStatus?.inCall) {
            const otherUserId = callStatus.withUserId;
            if (otherUserId && userSocketMap.has(otherUserId)) {
              const otherSockets = userSocketMap.get(otherUserId);
              otherSockets.forEach(socketId => {
                io.to(socketId).emit("callEnded", {
                  message: "User disconnected unexpectedly",
                });
              });
              userCallStatus.set(otherUserId, { inCall: false, withUserId: null });
            }
          }

          userCallStatus.delete(userId);
        } else {
          // Update presence with remaining sockets
          if (userPresenceMap.has(userId)) {
            userPresenceMap.get(userId).socketIds = Array.from(userSockets);
          }
        }
      }

      io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
    }
  });
});

// Routes
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/calls", callRouter);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle CORS errors specifically
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ 
      message: "CORS error: Origin not allowed",
      error: err.message 
    });
  }
  
  res.status(500).json({ 
    message: "Something went wrong!", 
    error: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message 
  });
});

// 404 handler
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
        console.log(`🔗 CORS enabled for: ${allowedOrigins.join(', ')}`);
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