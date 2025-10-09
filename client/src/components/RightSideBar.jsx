import React, { useContext, useEffect, useState } from 'react'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import assets from '../assets/assets'   // ✅ import assets

const RightSideBar = () => {
  const { selectedUser, messages = [] } = useContext(ChatContext)   // ✅ default empty array
  const { logout, onlineUsers = [] } = useContext(AuthContext)      // ✅ default empty array
  const [msgImages, setMsgImages] = useState([])

  // Get all the images from the messages and set them to state 
  useEffect(() => {
    if (messages && messages.length > 0) {
      setMsgImages(messages.filter(msg => msg.image).map(msg => msg.image))
    } else {
      setMsgImages([])
    }
  }, [messages])

  return selectedUser && (
    <div className={`bg-[#8185B2]/10 text-white w-full relative overflow-y-scroll ${selectedUser ? "max-md:hidden" : ""}`}>
      {/* PROFILE */}
      <div className='pt-16 flex flex-col items-center gap-2 text-xs font-light mx-auto'>
        <img 
          src={selectedUser?.profilePic || assets.avatar_icon} 
          alt="profile pic" 
          className='w-20 aspect-[1/1] rounded-full'
        />
        <h1 className='px-10 text-xl font-medium mx-auto flex items-center gap-2'>
          {onlineUsers.includes(selectedUser?._id) && (
            <span className='w-2 h-2 mt-2.5 rounded-full bg-green-500'></span>
          )}
          {selectedUser?.fullName || "Unknown User"}
        </h1>
        <p className='px-5 mx-auto'>{selectedUser?.bio || "No bio available"}</p>
      </div>

      <hr className='border-[#ffffff50] my-4'/>

      {/* MEDIA DISPLAY */}
      <div className='px-5 text-xs'>
        <p>Media</p>
        <div className='mt-2 max-h-[200px] overflow-y-scroll grid grid-cols-2 gap-4 opacity-80'>
          {msgImages.length > 0 ? msgImages.map((url, index) => (
            <div key={index} onClick={() => window.open(url)} className='cursor-pointer rounded'>
              <img src={url} alt="" className='h-full rounded-md'/>
            </div>
          )) : (
            <p className="text-gray-400 col-span-2 text-center">No media shared yet</p>
          )}
        </div>
      </div>

      {/* LOG OUT BUTTON */}
      <button 
        className="absolute bottom-5 left-1/2 -translate-x-1/2
                   bg-gradient-to-r from-purple-400 to-violet-600
                   text-white text-sm font-medium
                   py-2 px-6 rounded-full cursor-pointer shadow-md
                   hover:from-purple-500 hover:to-violet-700 transition"
        onClick={logout}
      >
        LOG OUT
      </button>
    </div>
  )
}

export default RightSideBar
