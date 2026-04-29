import Message from "../models/Message.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import { io, userSocketMap } from "../server.js";

// ---------------- GET USERS FOR SIDEBAR ----------------
export const getUserForSidebar = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all users except logged-in user
    const users = await User.find({ _id: { $ne: userId } }).select("-password");

    // Collect unseen messages count per user
    const unseenMessages = {};
    await Promise.all(users.map(async (user) => {
      const messages = await Message.find({
        senderId: user._id,
        receiverId: userId,
        seen: false
      });
      if (messages.length > 0) unseenMessages[user._id] = messages.length;
    }));

    res.json({ success: true, users, unseenMessages });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};

// ---------------- GET MESSAGES ----------------
export const getMessages = async (req, res) => {
  try {
    const selectedUserId = req.params.id;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: selectedUserId },
        { senderId: selectedUserId, receiverId: myId }
      ]
    }).sort({ createdAt: 1 });

    // Mark messages from selectedUser as seen
    await Message.updateMany(
      { senderId: selectedUserId, receiverId: myId, seen: false },
      { seen: true }
    );

    res.json({ success: true, messages });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};

// ---------------- MARK MESSAGE AS SEEN ----------------
export const markMessageAsSeen = async (req, res) => {
  try {
    const messageId = req.params.id;
    const message = await Message.findById(messageId);

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

    if (message.receiverId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    message.seen = true;
    message.status = "read";
    message.readAt = new Date();
    await message.save();

    const senderSocketId = userSocketMap[message.senderId.toString()];
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageStatusUpdate", {
        messageId,
        status: "read",
        timestamp: message.readAt,
      });
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------- UPDATE MESSAGE STATUS ----------------
export const updateMessageStatus = async (req, res) => {
  try {
    const messageId = req.params.id;
    const { status } = req.body; // 'delivered' or 'read'
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.json({ success: false, message: "Message not found" });
    }

    // Only receiver can update status
    if (message.receiverId.toString() !== userId.toString()) {
      return res.json({ success: false, message: "Unauthorized" });
    }

    const updateData = {
      status,
      [status === "delivered" ? "deliveredAt" : "readAt"]: new Date(),
    };

    if (status === "read") {
      updateData.seen = true;
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      updateData,
      { new: true },
    );

    // Emit status update to sender
    const senderSocketId = userSocketMap[message.senderId.toString()];
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageStatusUpdate", {
        messageId,
        status,
        timestamp: updateData.deliveredAt || updateData.readAt,
      });
    }

    res.json({ success: true, message: updatedMessage });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};

// ---------------- SEND MESSAGE ----------------
export const sendMessage = async (req, res) => {
  try {
    const { text, image, fileUrl, fileName, fileSize } = req.body;
    const receiverId = req.params.id;
    const senderId = req.user._id; // ✅ get from authenticated user

    let imageUrl = "";
    let messageType = "text";

    if (image) {
      // Upload to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
      messageType = "image";
    }

    if (fileUrl) {
      messageType = "file";
    }

    // Save message to MongoDB
    const newMessage = await Message.create({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      messageType,
      fileUrl,
      fileName,
      fileSize,
      status: "sent",
    });

    // Emit message to receiver if online
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("new message", newMessage);

      // Auto-mark as delivered if receiver is online
      await Message.findByIdAndUpdate(newMessage._id, {
        status: "delivered",
        deliveredAt: new Date(),
      });

      // Emit delivery status to sender
      const senderSocketId = userSocketMap[senderId.toString()];
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageStatusUpdate", {
          messageId: newMessage._id,
          status: "delivered",
          timestamp: new Date(),
        });
      }
    }

    res.json({ success: true, newMessage });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};
