import { useContext, useEffect } from "react";
import { createContext, useState } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";



export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {

    const [messages, setMessages] =  useState([]);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [unseenMessages, setunseenMessages] = useState({});

    const {socket, axios} = useContext(AuthContext);

    const getUsers = async () => {
        try {
            const {data} = await axios.get("/api/messages/users");
            if(data.success) { 
                setUsers(data.users)
                setunseenMessages(data.unseenMessages)

            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // function to get all users for sidebar
        const getMessages = async (userId) => {
            try {
                const {data} = await axios.get(`/api/messages/${userId}`);
                if(data.success) {
                    setMessages(data.messages)
                }
            } catch (error) {
               toast.error(error.message) 
            }            
        }
    // function to send message to selected users
    const sendMessage = async (messageData) => {
        try {
            const {data} = await axios.post(`/api/messages/send/${selectedUser._id}`, messageData);
            if(data.success) {
                setMessages((prevMessage)=>[...prevMessage, data.newMessage])
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    }
    // function to subscribe to message for selected user
    const subscribeToMessage = async () => {
       if (!socket) return;
        socket.on("newMessage", (newMessage) => {
            if (selectedUser && newMessage.senderId === selectedUser._id) {
                newMessage.seen = true;
                setMessages((prevMessage) => [...prevMessage, newMessage]);
                axios.put(`/api/messages/mark/${newMessage._id}`);
            } else {
                setunseenMessages((prevUnseenMessages) => ({
                    ...prevUnseenMessages,
                    [newMessage.senderId]: prevUnseenMessages[newMessage.senderId]
                        ? prevUnseenMessages[newMessage.senderId] + 1
                        : 1
                }));
            }
        });
    }
        
    //unsubscribe from messages
     const unsubscribeFromMessages = () => {
        if(socket) socket.off("newMessage");
     }

     useEffect(()=> {
        subscribeToMessage();
        return () => unsubscribeFromMessages();
     }, [socket, selectedUser])

    const value = {
        messages, users, selectedUser, getUsers, getMessages, sendMessage, setSelectedUser, unseenMessages, setunseenMessages
    }

    return (
    <ChatContext.Provider value={value}>
        { children }
    </ChatContext.Provider>
)
}