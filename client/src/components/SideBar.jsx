import React, { useContext, useEffect, useState } from 'react'
import assets from '../assets/assets'
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { ChatContext } from '../../context/ChatContext';

const SideBar = () => {
  const { getUsers, users = [], selectedUser, setSelectedUser, unseenMessages = {} } = useContext(ChatContext)
  const { logout, onlineUsers = [] } = useContext(AuthContext) 
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate();

  const filteredUsers = input 
    ? users.filter(user => user.fullName?.toLowerCase().includes(input.toLowerCase())) 
    : users;

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true)
      await getUsers()
      setIsLoading(false)
    }
    fetchUsers()
  }, [onlineUsers])

  return (
    <div className={` h-full flex flex-col ${selectedUser ? "max-md:hidden" : ''}`}>
      
      {/* Header */}
      <div className='p-5 border-b border-[#e94560]/20'>
        <div className='flex justify-between items-center mb-6'>
          <img src={assets.logo} alt="logo" className='h-8 object-contain' />
          <div className='relative group'>
            <button className='p-2 hover:bg-white/10 rounded-full transition-colors'>
              <img src={assets.menu_icon} alt="menu" className='w-5 h-5' />
            </button>
            <div className='absolute top-full right-0 z-20 w-48 mt-2 py-2 rounded-lg bg-[#0f3460] border border-[#e94560]/30 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200'>
              <button 
                onClick={() => navigate('/profile')} 
                className='w-full px-4 py-2 text-left text-sm hover:bg-white/10 transition-colors'
              >
                Edit Profile
              </button>
              <hr className='my-1 border-[#e94560]/20'/>
              <button 
                onClick={() => logout()} 
                className='w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-white/10 transition-colors'
              >
                Log Out
              </button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className='relative'>
          <input 
            onChange={(e) => setInput(e.target.value)}
            value={input}
            type="text" 
            className='w-full bg-[#0f3460]/50 rounded-full py-3 px-4 pl-11 outline-none text-white text-sm placeholder-gray-400 focus:ring-2 focus:ring-purple-200 transition-all'
            placeholder='Search users...'
          />
          <img src={assets.search_icon} alt="search" className='absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50'/>
        </div>
      </div>

      {/* Users list */}
      <div className='flex-1 overflow-y-auto custom-scrollbar'>
        {isLoading ? (
          <div className='flex justify-center items-center h-32'>
            <div className='animate-spin rounded-full h-8 w-8 border-2 border-purple-200 border-t-transparent'></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className='text-center text-gray-400 mt-8'>
            <p>No users found</p>
          </div>
        ) : (
          filteredUsers.map((user) => (
            <button
              key={user._id}
              className={`w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-all duration-200 group
                ${selectedUser?._id === user._id ? 'bg-gradient-to-r from-purple-600 to-indigo-600/20 border-r-2 border-purple-400' : ''}`}
              onClick={() => setSelectedUser(selectedUser?._id === user._id ? null : user)}
            >
              <div className='relative'>
                <img 
                  src={user?.profilePic || assets.avatar_icon} 
                  alt={user.fullName}
                  className='w-12 h-12 rounded-full object-cover'
                />
                {onlineUsers.includes(user._id) && (
                  <span className='absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 ring-2 ring-[#1a1a2e]'></span>
                )}
              </div>
              <div className='flex-1 text-left'>
                <p className='text-white font-medium text-sm'>{user.fullName}</p>
                <p className='text-xs text-gray-400'>
                  {onlineUsers.includes(user._id) ? 'Online' : 'Offline'}
                </p>
              </div>
              {(unseenMessages[user._id] || 0) > 0 && (
                <div className='min-w-[20px] h-5 px-1 rounded-full bg-gradient-to-r from-purple-400 to-violet-600 flex items-center justify-center'>
                  <span className='text-white text-xs font-bold'>
                    {unseenMessages[user._id] > 99 ? '99+' : unseenMessages[user._id]}
                  </span>
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default SideBar