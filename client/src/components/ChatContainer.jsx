import React, { useContext, useEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { useNavigate } from 'react-router-dom';
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import { toast } from 'react-hot-toast'

const ChatContainer = () => {
  const { messages = [], selectedUser, setSelectedUser, sendMessage, getMessages } = useContext(ChatContext)
  const { authUser, onlineUsers = [] } = useContext(AuthContext)

  const scrollEnd = useRef(null)
  const [input, setInput] = useState('')

  // handle sending message
  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (input.trim() === "") return
    await sendMessage({ text: input.trim() })
    setInput("")
  }

  // handle sending an image
  const handleSendImage = async (e) => {
    const file = e.target.files[0]
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Select an image file")
      return
    }
    const reader = new FileReader()
    reader.onloadend = async () => {
      await sendMessage({ image: reader.result })
      e.target.value = ""
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (selectedUser) {
      getMessages(selectedUser._id)
    }
  }, [selectedUser])

  useEffect(() => {
    if (scrollEnd.current && messages) {
      scrollEnd.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  return selectedUser ? (
    <div className='h-full overflow-scroll relative backdrop-blur-lg'>
      {/* HEADER */}
      <div className='flex items-center gap-3 py-3 mx-4 border-b border-stone-500'>
        <img src={selectedUser?.profilePic || assets.avatar_icon} alt="profile pic" className='w-8 rounded-full'/>
        <p className='flex-1 text-lg text-white flex items-center gap-2'>
          {selectedUser?.fullName}
          {onlineUsers.includes(selectedUser?._id) && (
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
          )}
        </p>
        <img onClick={() => setSelectedUser(null)} src={assets.arrow_icon} alt="" className='md:hidden max-w-7'/>
      </div>

      {/* CHAT AREA */}
      <div className='flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-6'>
        {messages.length > 0 ? messages.map((msg, index) => (
          <div 
            key={index} 
            className={`flex items-end gap-2 justify-end ${msg.senderId !== authUser?._id ? 'flex-row-reverse' : ''}`}
          >
            {msg.image ? (
              <img src={msg.image} alt="" className='max-w-[230px] border border-gray-500 rounded-lg overflow-hidden mb-8'/>
            ) : (
              <p className={`p-2 max-w-[200px] md:text-sm font-light rounded-lg mb-8 break-all bg-gradient-to-r from-purple-400 to-violet-600/50 text-white 
                ${msg.senderId !== authUser?._id ? 'rounded-br-none' : 'rounded-bl-none'}`}>
                {msg.text}
              </p>
            )}
            <div className='text-center text-xs'>
              <img 
                src={msg.senderId === authUser?._id 
                  ? authUser?.profilePic || assets.avatar_icon 
                  : selectedUser?.profilePic || assets.avatar_icon} 
                alt="avatar" 
                className="w-7 rounded-full"
              />
              <p className='text-gray-500'>{formatMessageTime(msg.createdAt)}</p>
            </div>
          </div>
        )) : (
          <p className="text-gray-400 text-center mt-4">No messages yet</p>
        )}
        <div ref={scrollEnd}></div>
      </div>

      {/* BOTTOM AREA */}
      <div className='absolute bottom-0 left-0 right-0 flex items-center gap-3 p-3'>
        <div className='flex-1 flex items-center bg-gray-100/12 px-3 rounded-full'>
          <input 
            onChange={(e) => setInput(e.target.value)} 
            value={input}
            onKeyDown={(e) => e.key === "Enter" ? handleSendMessage(e) : null }
            type="text" 
            placeholder='Discuss with SOD' 
            className='flex-1 text-sm p-3 border-none rounded-lg outline-none text-white'
          />
          <input onChange={handleSendImage} type="file" accept='image/png, image/jpeg' id='image' hidden/>
          <label htmlFor="image">
            <img src={assets.gallery_icon} alt="g-icon" className='w-5 mr-3 mt-3 cursor-pointer'/>
          </label>
        </div>
        <img 
          onClick={handleSendMessage} 
          src={assets.send_button} 
          alt="s-btn" 
          className='w-7 cursor-pointer bg-gradient-to-r from-purple-400 to-violet-600 rounded-full p-1.5'
        />
      </div>
    </div>
  ) : (
    <div className='flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
      <img src={assets.logo_icon} alt="" className='max-w-16'/>
      <p className='text-lg font-medium text-white'>Let's chat as SOD anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer