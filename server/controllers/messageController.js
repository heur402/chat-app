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
    await Message.findByIdAndUpdate(messageId, { seen: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};

// ---------------- SEND MESSAGE ----------------
export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const receiverId = req.params.id;
    const senderId = req.user._id; // ✅ get from authenticated user

    let imageUrl = "";
    if (image) {
      // Upload to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // Save message to MongoDB
    const newMessage = await Message.create({
      senderId,
      receiverId,
      text,
      image: imageUrl
    });

    // Emit message to receiver if online
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("new message", newMessage);
    }

    res.json({ success: true, newMessage });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};
