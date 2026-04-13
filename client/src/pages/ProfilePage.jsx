import React, { useContext, useState } from 'react'
import assets from '../assets/assets'
import { useNavigate } from "react-router-dom"
import { AuthContext } from '../../context/AuthContext'

const ProfilePage = () => {

  const { authUser, updateProfile } = useContext(AuthContext)

  const [selectedImg, setSelectedImg] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const navigate = useNavigate()
  const [name, setName] = useState(authUser?.fullName || "")
  const [bio, setBio] = useState(authUser?.bio || "")

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedImg) {
      await updateProfile({ fullName: name, bio });
      navigate('/');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(selectedImg);
    reader.onload = async () => {
      const base64Image = reader.result;
      await updateProfile({ profilePic: base64Image, fullName: name, bio });
      navigate('/');
    }
  }

  // Cleanup preview URL to avoid memory leaks
  React.useEffect(() => {
    if (selectedImg) {
      const url = URL.createObjectURL(selectedImg);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [selectedImg]);

  return (
    <div className='min-h-screen bg-cover bg-no-repeat flex items-center justify-center relative'>
      {/* Back button - Improved visibility on mobile */}
      <button 
        onClick={() => navigate('/')} 
        className='absolute top-4 left-4 z-50 p-3 bg-black/50 hover:bg-white/20 rounded-full transition-all backdrop-blur-sm border border-white/20'
        aria-label="Go back"
      >
        <img 
          src={assets.arrow_icon} 
          alt="Back" 
          className='w-5 h-5 sm:w-6 sm:h-6 filter brightness-0 invert' 
        />
      </button>

      {/* Optional: Add a floating back button for better visibility */}
      <button 
        onClick={() => navigate('/')} 
        className='fixed bottom-6 left-6 md:hidden z-50 p-3 bg-purple-600 hover:bg-purple-700 rounded-full shadow-lg transition-all active:scale-95'
        aria-label="Go back"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>

      <div className='w-11/12 sm:w-5/6 max-w-2xl backdrop-blur-2xl text-gray-300 border-2 border-gray-600 flex items-center justify-between max-sm:flex-col-reverse rounded-lg mt-16 sm:mt-0'>
        <form onSubmit={handleSubmit} className='flex flex-col gap-5 p-6 sm:p-10 flex-1 w-full'>
          <h3 className='text-lg font-semibold text-center sm:text-left'>Profile Details</h3>
          
          <label htmlFor="avatar" className='flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors'>
            <input 
              onChange={(e) => setSelectedImg(e.target.files[0])}
              type="file" 
              id='avatar' 
              accept='.jpeg,.png,.jpg' 
              hidden
            />
            <img 
              src={previewUrl || authUser?.profilePic || assets.avatar_icon} 
              alt="Avatar" 
              className='w-12 h-12 rounded-full object-cover border-2 border-purple-400'
            />
            <span className='text-sm'>Upload profile image</span>
          </label>
          
          <input 
            onChange={(e) => setName(e.target.value)} 
            value={name}
            type="text" 
            className='p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-transparent text-white'
            placeholder='Your name' 
            required
          />
          
          <textarea 
            onChange={(e) => setBio(e.target.value)} 
            value={bio} 
            placeholder='Change your bio'
            required
            className='p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-transparent resize-none text-white' 
            rows={4}
          />
          
          <button 
            type="submit" 
            className='py-3 bg-gradient-to-r from-purple-400 to-violet-600 text-white rounded-md cursor-pointer hover:opacity-90 transition-opacity font-semibold'
          >
            Save Changes
          </button>
        </form>
        
        <div className='p-6 sm:p-10 max-sm:pb-4'>
          <img 
            src={previewUrl || authUser?.profilePic || assets.logo_icon} 
            alt="Profile Preview" 
            className='w-32 h-32 sm:w-44 sm:h-44 rounded-full object-cover border-4 border-purple-400'
          />
        </div>
      </div>
    </div>
  )
}

export default ProfilePage