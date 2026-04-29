import { createContext, useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { io } from "socket.io-client";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
axios.defaults.baseURL = backendUrl;

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("accessToken"));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem("refreshToken"));
  const [authUser, setAuthUser] = useState(null);
  const [onlineUsers, setOnlineusers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Refresh access token
  const refreshAccessToken = useCallback(async () => {
    try {
      if (!refreshToken) {
        logout();
        return null;
      }

      const { data } = await axios.post("/api/auth/refresh", { refreshToken });
      if (data.success) {
        const newAccessToken = data.accessToken;
        const newRefreshToken = data.refreshToken;

        setToken(newAccessToken);
        setRefreshToken(newRefreshToken);
        localStorage.setItem("accessToken", newAccessToken);
        localStorage.setItem("refreshToken", newRefreshToken);
        axios.defaults.headers.common["token"] = newAccessToken;

        return newAccessToken;
      }
    } catch (error) {
      console.error("Token refresh failed:", error);
      logout();
    }
    return null;
  }, [refreshToken]);

  // Axios interceptor for automatic token refresh
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && error.response?.data?.code === "TOKEN_EXPIRED" && !originalRequest._retry) {
          originalRequest._retry = true;
          const newToken = await refreshAccessToken();
          if (newToken) {
            originalRequest.headers.token = newToken;
            return axios(originalRequest);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, [refreshAccessToken]);

  // Check if user is authenticated
  const checkAuth = async () => {
    try {
      const { data } = await axios.get("/api/auth/check");
      if (data.success) {
        setAuthUser(data.user);
        connectSocket(data.user);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      // Try to refresh token if auth check fails
      await refreshAccessToken();
    }
  };

  // Login function
  const login = async (state, credentials) => {
    try {
      const { data } = await axios.post(`/api/auth/${state}`, credentials);
      if (data.success) {
        setAuthUser(data.userData);
        setToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        axios.defaults.headers.common["token"] = data.accessToken;
        connectSocket(data.userData);
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      if (token) {
        await axios.post("/api/auth/logout");
      }
    } catch (error) {
      console.error("Logout API call failed:", error);
    }

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setToken(null);
    setRefreshToken(null);
    setAuthUser(null);
    setOnlineusers([]);
    axios.defaults.headers.common["token"] = null;

    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    toast.success("Logged out successfully");
  };

  // Update profile function
  const updateProfile = async (body) => {
    try {
      const { data } = await axios.put("/api/auth/update-profile", body);
      if (data.success) {
        setAuthUser(data.user);
        toast.success("Profile updated successfully");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Enhanced socket connection with reconnection logic
  const connectSocket = (userData) => {
    if (!userData || socket?.connected) return;

    const newSocket = io(backendUrl, {
      query: {
        userId: userData._id,
        userInfo: JSON.stringify({
          fullName: userData.fullName,
          profilePic: userData.profilePic
        })
      },
      transports: ["websocket", "polling"],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });

    // Connection events
    newSocket.on("connect", () => {
      console.log("Socket connected");
      setIsReconnecting(false);
      toast.success("Connected to chat server");
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsReconnecting(true);
      if (reason === "io server disconnect") {
        // Server disconnected, manual reconnection needed
        setTimeout(() => newSocket.connect(), 1000);
      }
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setIsReconnecting(true);
    });

    newSocket.on("reconnect", (attemptNumber) => {
      console.log("Socket reconnected after", attemptNumber, "attempts");
      setIsReconnecting(false);
      toast.success("Reconnected to chat server");
    });

    newSocket.on("reconnect_error", (error) => {
      console.error("Socket reconnection failed:", error);
      setIsReconnecting(true);
    });

    // Heartbeat handling
    newSocket.on("ping", (data) => {
      newSocket.emit("pong", { timestamp: Date.now() });
    });

    // Online users
    newSocket.on("getOnlineUsers", (userIds) => {
      setOnlineusers(userIds);
    });

    newSocket.connect();
    setSocket(newSocket);
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["token"] = token;
      checkAuth();
    }
  }, []);

  const value = {
    axios,
    authUser,
    onlineUsers,
    socket,
    isReconnecting,
    login,
    logout,
    updateProfile,
    refreshAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};