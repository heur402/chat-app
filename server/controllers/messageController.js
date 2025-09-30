import Message from "../models/Message.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import { io, userSocketMap } from "../server.js";


// get all users except login user
export const getUserForSidebar = async (req, res) => {
    try {
        const userId = req.user._id;
        const filteredUsers = await User.find({_id: {$ne: userId}}).select("-password");

        //count number of message not seen
        const unseenMessages = {}
        const promisses = filteredUsers.map(async () => {
            const messages = await Message.find({senderId: user._id, receiverId: userId, seen: false})
            if(messages.length > 0) {
                unseenMessages[user._id] = Message.length;
            }
        })
        await promisses.all(promisses);
        res.json({success: true, users: filteredUsers, unseenMessages})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}

// get all messages for selected users
export const getMessages = async (req, res) => {
    try {
        const { id: selectedUserId } = req.params;
        const myId = req.user._id;

        const messages = await Message.find({
            $or: [
                {senderId: myId, receiverId: selectedUserId},
                {senderId: selectedUserId, receiverId: myId},
            ]
        })
        await Message.updateMany({senderId: selectedUserId, receiverId: myId}, {seen: true});
        res.json({success: true, messages})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})   
    }
}

// api to mark all messages as seen
export const markMessageAsSeen = async (req, res) => {
    try {
        const id = req.params;
        await Message.findByIdAndDelete(id, {seen: true})
        res.json({success: true,})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})  
    }
}

// send message to selected user
export const sendMessage = async (req, res) => {
    try {
        const {text, image} = req.body;
        const receiverId = req.params.id;
        const senderId = req.senderId;

        let imageurl;
        if (image) {
            const uploadResponse = await cloudinary.uploader.upload(image)
            imageurl = uploadResponse.secure_url;

        }
        const newMessage = await Message.Create({
            senderId,
            receiverId,
            text, 
            image: imageurl
        })

        //emit the new message to the receive's socket
        const receiveSocketId = userSocketMap[receiverId];
        if(receiveSocketId) {
            io.to(receiveSocketId).emit("new message", newMessage)
        }

        res.json({success: false, newMessageessage});

    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})    
    }
}