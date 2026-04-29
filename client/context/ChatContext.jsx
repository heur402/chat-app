import { createContext, useState, useContext, useEffect, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unseenMessages, setUnseenMessages] = useState({});
  const [presence, setPresence] = useState({}); // Enhanced presence tracking
  const [typingUsers, setTypingUsers] = useState(new Set()); // Typing indicators
  const [offlineQueue, setOfflineQueue] = useState([]); // Offline message queue
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { socket, axios, authUser, isReconnecting } = useContext(AuthContext);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineMessages();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync offline messages when back online
  const syncOfflineMessages = useCallback(async () => {
    if (offlineQueue.length > 0 && isOnline && !isReconnecting) {
      for (const messageData of offlineQueue) {
        try {
          await sendMessage(messageData);
        } catch (error) {
          console.error("Failed to sync offline message:", error);
        }
      }
      setOfflineQueue([]);
      toast.success("Offline messages synced");
    }
  }, [offlineQueue, isOnline, isReconnecting]);

  // Fetch all users for sidebar
  const getUsers = async () => {
    try {
      const { data } = await axios.get("/api/messages/users");
      if (data.success) {
        setUsers(data.users);
        setUnseenMessages(data.unseenMessages);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Fetch messages for selected user
  const getMessages = async (userId) => {
    try {
      const { data } = await axios.get(`/api/messages/${userId}`);
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Send a message to selected user
  const sendMessage = async (messageData) => {
    if (!selectedUser) return;

    // If offline or reconnecting, queue the message
    if (!isOnline || isReconnecting) {
      const queuedMessage = {
        ...messageData,
        id: Date.now().toString(),
        timestamp: new Date(),
        status: 'queued'
      };
      setOfflineQueue(prev => [...prev, queuedMessage]);
      setMessages(prevMessages => [...prevMessages, queuedMessage]);
      return;
    }

    try {
      const { data } = await axios.post(
        `/api/messages/send/${selectedUser._id}`,
        messageData
      );
      if (data.success) {
        setMessages((prevMessages) => [...prevMessages, data.newMessage]);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Update message status (delivered/read)
  const updateMessageStatus = async (messageId, status) => {
    try {
      await axios.put(`/api/messages/status/${messageId}`, { status });
    } catch (error) {
      console.error("Failed to update message status:", error);
    }
  };

  // Send typing indicator
  const sendTypingIndicator = useCallback((isTyping) => {
    if (socket && selectedUser) {
      socket.emit('typing', {
        toUserId: selectedUser._id,
        isTyping
      });
    }
  }, [socket, selectedUser]);

  // Update presence status
  const updatePresence = useCallback((status) => {
    if (socket) {
      socket.emit('updatePresence', status);
    }
  }, [socket]);

  // Subscribe to real-time events
  const subscribeToMessages = useCallback(() => {
    if (!socket) return;

    // New messages
    socket.on("newMessage", (newMessage) => {
      if (selectedUser && newMessage.senderId === selectedUser._id) {
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        // Mark as read
        updateMessageStatus(newMessage._id, 'read');
      } else {
        // Increment unseen message count
        setUnseenMessages((prev) => ({
          ...prev,
          [newMessage.senderId]: prev[newMessage.senderId]
            ? prev[newMessage.senderId] + 1
            : 1,
        }));
      }
    });

    // Message status updates
    socket.on("messageStatusUpdate", (data) => {
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg._id === data.messageId
            ? { ...msg, status: data.status, [data.status === 'delivered' ? 'deliveredAt' : 'readAt']: new Date(data.timestamp) }
            : msg
        )
      );
    });

    // Presence updates
    socket.on("presenceUpdate", (data) => {
      setPresence(prev => ({
        ...prev,
        [data.userId]: {
          status: data.status,
          lastSeen: new Date(data.lastSeen)
        }
      }));
    });

    // Typing indicators
    socket.on("userTyping", (data) => {
      if (data.fromUserId !== authUser?._id) {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          if (data.isTyping) {
            newSet.add(data.fromUserId);
          } else {
            newSet.delete(data.fromUserId);
          }
          return newSet;
        });
      }
    });

  }, [socket, selectedUser, authUser, updateMessageStatus]);

  // Unsubscribe from messages
  const unsubscribeFromMessages = useCallback(() => {
    if (socket) {
      socket.off("newMessage");
      socket.off("messageStatusUpdate");
      socket.off("presenceUpdate");
      socket.off("userTyping");
    }
  }, [socket]);

  // Subscribe when socket or selectedUser changes
  useEffect(() => {
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [subscribeToMessages, unsubscribeFromMessages]);

  // Auto-away status when window loses focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updatePresence('away');
      } else {
        updatePresence('online');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [updatePresence]);

  const value = {
    messages,
    users,
    selectedUser,
    setSelectedUser,
    unseenMessages,
    setUnseenMessages,
    presence,
    typingUsers,
    isOnline,
    isReconnecting,
    offlineQueue,
    getUsers,
    getMessages,
    sendMessage,
    updateMessageStatus,
    sendTypingIndicator,
    updatePresence,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};
