import Message from "../models/Message.js";
import { io, userSocketMap } from "../server.js";

export const sendMessage = async (req, res) => {
  try {
    const receiverId = req.params.id;
    const { text } = req.body;

    const newMessage = await Message.create({
      senderId: req.user.id, // from protectRoute
      receiverId,
      text,
    });

    // Emit to receiver in real-time if they are online
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
