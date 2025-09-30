import React from 'react'
import assets, { imagesDummyData } from '../assets/assets'

const RightSideBar = ({selectedUser}) => {
  return selectedUser && (
    <div className={`bg[#8185B2]/10 text-white w-full relative overflow-y-scroll ${selectedUser ? "max-md:hidden" : ""}`}>
        {/*........PROFILE..............*/}
        <div className='pt-16 flex flex-col items-center gap-2 text-xs font-light mx-auto'>
          <img src={selectedUser?.profilePic || assets.avatar_icon} alt="p-pic" 
          className='w-20 aspect[1/1] rounded-full'/>
          <h1 className='px-10 text-xl font-medium mx-auto flex item-center gap-2'>
            <p className='w-2 h-2 mt-2.5 rounded-full bg-green-500 '></p>
            {selectedUser.fullName}
            </h1>
            <p className='px-5 mx-auto'>{selectedUser.bio}</p>
        </div>
        <hr className='border-[#ffffff50] my-4'/>
        {/*...............MEDIA DISPLAY................*/}
        <div className='px-5 text-xs'>
          <p>Media</p>
          <div className='mt-2 max-h-[200px] overflow-y-scroll grid grid-cols-2 gap-4 opacity-80'>
              {imagesDummyData.map((url, index)=> (
                <div key={index} onClick={()=> window.open(url)} className='cursor-pointer rounded'>
                  <img src={url} alt="" className='h-full rounded-md'/>
                </div>
              ))}
          </div>
        </div>
        {/*..............LOG OUT BUTTON.............*/}
        <button className="absolute bottom-5 left-1/2 -translate-x-1/2
                        bg-gradient-to-r from-purple-400 to-violet-600
                        text-white text-sm font-medium
                        py-2 px-6 rounded-full cursor-pointer shadow-md
                        hover:from-purple-500 hover:to-violet-700 transition">
              LOG OUT
            </button>

    </div>
  )
}

export default RightSideBar