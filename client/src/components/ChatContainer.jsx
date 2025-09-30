import React, { useEffect, useRef } from 'react'
import assets, { messagesDummyData } from '../assets/assets'
import { formatMessageTime } from '../lib/utils'

const ChatContainer = ({selectedUser, setSelectedUser}) => {
  const scrollEnd = useRef ()
  useEffect(()=> {
    if(scrollEnd.current) {
      scrollEnd.current.scrollIntoView({behaviour : "smooth"})
    }
  }, [])
  return selectedUser ? (
    <div className='h-full overflow-scroll relative backdrops-blur-lg'>
          {/*.........HEADER..........*/}
        <div className='flex item-center gap-3 py-3 mx-4 border-b border-stone-500'>
          <img src={assets.profile_martin} alt="profilr pic" className='w-8 rounded-full'/>
          <p className='flex-1 text-lg text-white flex items-center gap-2'>
            Martin Jonhson
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
          </p>
          <img onClick={()=> setSelectedUser(null)} src={assets.arrow_icon} alt="" className='md:hidden max-w-7'/>
          <img src={assets.help_icon} alt="" className='max-md:hidden max-w-5 h-5 m-0'/>
        </div>
          {/*.........CHAT AREA..........*/}
        <div className='flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-6'>
          {messagesDummyData.map((msg, index)=> (
            <div key={index} className={`flex items-end gap-2 justify-end 
            ${msg.senderId !== '680f50e4f10f3cd28382ecf9' && 'flex-row-reverse'}`}>
              {msg.image ? (
                <img src={msg.image} alt="" className='max-w-[230px] border border-gray-500 rounded-lg overflow-hidden mb-8'/>
              ) : (
                <p className={`p-2 max-w-[200px] md:text-sm font-light rounded-lg mb-8 break-all bg-violet-500/30 text-white 
                  ${msg.senderId !== '680f50e4f10f3cd28382ecf9' ? 'rounded-br-none' : 'rounded-bl-none'}
                  `}>{msg.text}</p>
              )}
              <div className='text-center text-xs'>
                <img src={msg.senderId !== '680f50e4f10f3cd28382ecf9' ? assets.profile_martin : assets.avatar_icon} 
                alt="avatar" className='w-7 rounded-full'/>
                <p className='text-gray-500'>{formatMessageTime(msg.createdAt)}</p>
              </div>

            </div>
          ))}
          <div ref={scrollEnd}></div>
        </div>

        {/*..........BOTTOM AREA...........*/}  
          <div className='absolute bottom-0 left-0 right-0 flex item-center gap-3 p-3'>
              <div className='flex-1 flex item-center bg-gray-100/12 px-3 rounded-full'>
                <input type="text" placeholder='discuss with SOD' 
                className='flex-1 text-sm p-3 border-none rounded-lg outline-none text-white '/>
                <input type="file" accept='image/png image/jpeg' id='image' hidden/>
                <label htmlFor="image">
                  <img src={assets.gallery_icon} alt="g-icon" className='w-5 mr-3 mt-3 cursor-pointer'/>
                </label>
              </div>
              <img src={assets.send_button} alt="s-btn" className='w-7 cursor-pointer'/>
          </div>
    </div>
  ) : (
    <div className='flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
      <img src={assets.logo_icon} alt="" className='max-w-16'/>
      <p className='text-lg font-medium text-white'>let's chat as SOD anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer