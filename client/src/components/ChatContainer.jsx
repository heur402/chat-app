import React, { useContext, useEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import { toast } from 'react-hot-toast'
import { io } from 'socket.io-client'

const ChatContainer = () => {
  const { messages = [], selectedUser, setSelectedUser, sendMessage, getMessages } = useContext(ChatContext)
  const { authUser, onlineUsers = [], socket } = useContext(AuthContext)

  const scrollEnd = useRef(null)
  const [input, setInput] = useState('')

  // CALL STATES
  const [isCallActive, setIsCallActive] = useState(false)
  const [isCalling, setIsCalling] = useState(false)
  const [isReceivingCall, setIsReceivingCall] = useState(false)
  const [callType, setCallType] = useState(null) // 'audio' or 'video'
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [remoteStream, setRemoteStream] = useState(null)
  const [callDuration, setCallDuration] = useState(0)
  const [incomingCallInfo, setIncomingCallInfo] = useState(null)

  // WebRTC Refs
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const callTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioLevelsIntervalRef = useRef(null)
  
  // Audio levels state
  const [audioLevels, setAudioLevels] = useState(new Array(30).fill(10))

  // Helper function to truncate name
  const truncateName = (name, maxLength = 15) => {
    if (!name) return ''
    if (name.length <= maxLength) return name
    return name.substring(0, maxLength) + '...'
  }

  // Detect mobile device
  const isMobile = () => {
    return window.innerWidth <= 768
  }

  // Get dynamic max length based on screen width
  const getNameMaxLength = () => {
    const width = window.innerWidth
    if (width < 380) return 12
    if (width < 480) return 15
    if (width < 640) return 20
    return 30
  }

  // WebRTC Configuration
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ],
    iceCandidatePoolSize: 10
  }

  // ================= HELPER FUNCTIONS =================
  const formatCallTime = (sec) => {
    const mins = Math.floor(sec / 60)
    const remainingSecs = sec % 60
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`
  }

  // ================= AUDIO VISUALIZATION =================
  const startAudioVisualization = () => {
    if (!localStreamRef.current) return
    
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current)
      const analyser = audioContextRef.current.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      
      audioLevelsIntervalRef.current = setInterval(() => {
        if (!isCallActive) return
        
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const level = Math.min(Math.max(average / 2, 10), 50)
        
        setAudioLevels(prev => {
          const newLevels = [...prev.slice(1), level]
          return newLevels
        })
      }, 100)
    } catch (error) {
      console.log("Audio visualization not supported")
    }
  }

  const stopAudioVisualization = () => {
    if (audioLevelsIntervalRef.current) {
      clearInterval(audioLevelsIntervalRef.current)
      audioLevelsIntervalRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }

  // ================= WEBRTC FUNCTIONS =================
  const getMedia = async (type) => {
  try {
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support camera/microphone access. Please use HTTPS or a modern browser.');
    }

    const constraints = {
      audio: true,
      video: type === 'video' ? { 
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } : false
    }
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    localStreamRef.current = stream
    
    if (localVideoRef.current && type === 'video') {
      localVideoRef.current.srcObject = stream
    }
    
    return stream
  } catch (error) {
    console.error("Error accessing media devices:", error)
    
    // Provide user-friendly error messages
    if (error.name === 'NotAllowedError') {
      toast.error("Please allow camera/microphone access to make calls")
    } else if (error.name === 'NotFoundError') {
      toast.error("No camera or microphone found on your device")
    } else if (error.name === 'NotSupportedError' || error.message.includes('browser does not support')) {
      toast.error("Your browser doesn't support video calls. Please use Chrome, Firefox, or Edge")
    } else if (error.message.includes('HTTPS')) {
      toast.error("Video calls require HTTPS connection. Please use HTTPS or localhost")
    } else {
      toast.error("Cannot access camera/microphone. Please check permissions.")
    }
    throw error
  }
}

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(configuration)
    
    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }
    
    // Handle remote stream
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0])
      if (remoteVideoRef.current && callType === 'video') {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("iceCandidate", {
          toUserId: selectedUser._id,
          candidate: event.candidate
        })
      }
    }
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall()
        toast.error("Call disconnected")
      }
    }
    
    return pc
  }

  const startCall = async (type) => {
    if (!selectedUser || !onlineUsers.includes(selectedUser._id)) {
      toast.error("User is offline")
      return
    }
    
    try {
      setCallType(type)
      setIsCalling(true)
      
      // Get user media
      await getMedia(type)
      
      // Create peer connection
      peerConnectionRef.current = createPeerConnection()
      
      // Create offer
      const offer = await peerConnectionRef.current.createOffer()
      await peerConnectionRef.current.setLocalDescription(offer)
      
      // Emit call event to server
      socket.emit("callUser", {
        fromUserId: authUser._id,
        toUserId: selectedUser._id,
        signalData: offer,
        callType: type
      })
      
      toast.loading(`Calling ${truncateName(selectedUser.fullName, 20)}...`, { id: "calling" })
      
    } catch (error) {
      console.error("Error starting call:", error)
      setIsCalling(false)
      toast.error("Failed to start call", { id: "calling" })
    }
  }

  const answerCall = async () => {
    if (!incomingCallInfo) return
    
    try {
      stopRingtone()
      setIsReceivingCall(false)
      
      // Get user media
      await getMedia(incomingCallInfo.callType)
      setCallType(incomingCallInfo.callType)
      
      // Create peer connection
      peerConnectionRef.current = createPeerConnection()
      
      // Set remote description
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(incomingCallInfo.signal)
      )
      
      // Create answer
      const answer = await peerConnectionRef.current.createAnswer()
      await peerConnectionRef.current.setLocalDescription(answer)
      
      // Emit accept event
      socket.emit("acceptCall", {
        fromUserId: incomingCallInfo.fromUserId,
        toUserId: authUser._id,
        signalData: answer
      })
      
      setIsCallActive(true)
      startCallTimer()
      startAudioVisualization()
      toast.success(`Call connected with ${truncateName(selectedUser.fullName, 20)}`, { id: "incoming" })
      
    } catch (error) {
      console.error("Error answering call:", error)
      toast.error("Failed to answer call")
      endCall()
    }
  }

  const endCall = () => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    
    // Clear remote stream
    setRemoteStream(null)
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    
    // Clear timers
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    
    stopAudioVisualization()
    
    // Emit end call event
    if (isCallActive && selectedUser) {
      socket.emit("endCall", {
        toUserId: selectedUser._id,
        callDuration
      })
    }
    
    // Reset states
    setIsCallActive(false)
    setIsCalling(false)
    setIsReceivingCall(false)
    setCallType(null)
    setIsMuted(false)
    setIsVideoEnabled(true)
    setCallDuration(0)
    setIncomingCallInfo(null)
    
    toast("Call ended")
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
        toast(!audioTrack.enabled ? "🔇 Microphone muted" : "🎤 Microphone unmuted")
      }
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current && callType === 'video') {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
        toast(videoTrack.enabled ? "📹 Video on" : "📹 Video off")
      }
    }
  }

  const toggleSpeaker = () => {
    if (remoteVideoRef.current) {
      // @ts-ignore
      remoteVideoRef.current.sinkId = isSpeakerOn ? '' : 'speaker'
      setIsSpeakerOn(!isSpeakerOn)
      toast(!isSpeakerOn ? "🔊 Speaker on" : "🔈 Speaker off")
    }
  }

  // ================= RINGTONE FUNCTIONS =================
  const playRingtone = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = 440
      gainNode.gain.value = 0.3
      oscillator.start()
      
      let isRinging = true
      const interval = setInterval(() => {
        if (!isReceivingCall) {
          clearInterval(interval)
          oscillator.stop()
          audioContext.close()
          return
        }
        gainNode.gain.value = isRinging ? 0.3 : 0
        isRinging = !isRinging
      }, 1000)
      
      return () => {
        clearInterval(interval)
        oscillator.stop()
        audioContext.close()
      }
    } catch (error) {
      console.log("Ringtone not supported")
    }
  }

  const stopRingtone = () => {
    // Ringtone cleanup handled in the interval
  }

  // ================= SOCKET EVENT HANDLERS =================
  useEffect(() => {
    if (!socket) return
    
    // Handle incoming call
    const handleIncomingCall = ({ fromUserId, signal, callType: incomingCallType }) => {
      if (isCallActive || isCalling) {
        socket.emit("callRejected", {
          fromUserId,
          toUserId: authUser._id
        })
        return
      }
      
      setIncomingCallInfo({
        fromUserId,
        signal,
        callType: incomingCallType
      })
      setCallType(incomingCallType)
      setIsReceivingCall(true)
      playRingtone()
      toast(`📞 Incoming ${incomingCallType} call from ${truncateName(selectedUser?.fullName, 15)}`, { id: "incoming", duration: null })
    }
    
    // Handle call accepted
    const handleCallAccepted = async ({ signal }) => {
      toast.success("Call answered!", { id: "calling" })
      
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(signal)
        )
        setIsCalling(false)
        setIsCallActive(true)
        startCallTimer()
        startAudioVisualization()
      }
    }
    
    // Handle call rejected
    const handleCallRejected = () => {
      toast.error("Call rejected", { id: "calling" })
      endCall()
    }
    
    // Handle ICE candidate
    const handleIceCandidate = async ({ candidate }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (error) {
          console.error("Error adding ICE candidate:", error)
        }
      }
    }
    
    // Handle call ended
    const handleCallEnded = () => {
      toast("Call ended by other user")
      endCall()
    }
    
    socket.on("incomingCall", handleIncomingCall)
    socket.on("callAccepted", handleCallAccepted)
    socket.on("callRejected", handleCallRejected)
    socket.on("iceCandidate", handleIceCandidate)
    socket.on("callEnded", handleCallEnded)
    
    return () => {
      socket.off("incomingCall", handleIncomingCall)
      socket.off("callAccepted", handleCallAccepted)
      socket.off("callRejected", handleCallRejected)
      socket.off("iceCandidate", handleIceCandidate)
      socket.off("callEnded", handleCallEnded)
    }
  }, [socket, selectedUser, isCallActive, isCalling])

  // ================= CHAT FUNCTIONS =================
  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    await sendMessage({ text: input })
    setInput("")
  }

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

  const startCallTimer = () => {
    setCallDuration(0)
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)
  }

  // ================= EFFECTS =================
  useEffect(() => {
    if (selectedUser) {
      getMessages(selectedUser._id)
    }
    // End call when switching users
    if (isCallActive || isCalling || isReceivingCall) {
      endCall()
    }
  }, [selectedUser])

  useEffect(() => {
    scrollEnd.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
      }
      stopAudioVisualization()
    }
  }, [])

  // ================= UI RENDER =================
  return selectedUser ? (
    <div className='h-full overflow-scroll relative backdrop-blur-lg'>
      
      {/* ACTIVE CALL OVERLAY */}
      {isCallActive && (
        <div className='fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center'>
          {/* Video Container */}
          <div className={`relative ${callType === 'video' ? 'w-full h-full' : 'text-center'}`}>
            {callType === 'video' ? (
              <>
                {/* Remote Video */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className='w-full h-full object-cover'
                />
                {/* Local Video (Picture-in-Picture) */}
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className='absolute bottom-4 right-4 w-32 h-48 rounded-lg border-2 border-purple-500 object-cover shadow-lg'
                />
              </>
            ) : (
              <>
                {/* Audio Call UI */}
                <div className='text-center mb-8'>
                  <div className='w-32 h-32 mx-auto rounded-full overflow-hidden border-4 border-purple-500 mb-4'>
                    <img 
                      src={selectedUser?.profilePic || assets.avatar_icon} 
                      alt={selectedUser?.fullName}
                      className='w-full h-full object-cover'
                    />
                  </div>
                  <h2 className='text-white text-2xl font-semibold px-4'>
                    {truncateName(selectedUser?.fullName, isMobile() ? 20 : 30)}
                  </h2>
                  <p className='text-green-400 text-lg font-mono mt-2'>
                    {formatCallTime(callDuration)}
                  </p>
                </div>
                
                {/* Audio Visualizer */}
                <div className='flex gap-1 items-center justify-center mb-8'>
                  {audioLevels.map((height, i) => (
                    <div 
                      key={i}
                      className='w-1.5 bg-gradient-to-t from-purple-500 to-pink-500 rounded-full transition-all duration-75'
                      style={{ 
                        height: `${height}px`,
                        opacity: isMuted ? 0.3 : 1
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Call Controls */}
          <div className='absolute bottom-8 left-0 right-0 flex justify-center gap-4 flex-wrap px-4'>
            <button 
              onClick={toggleMute}
              className={`p-4 rounded-full transition-all ${
                isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>

            {callType === 'video' && (
              <button 
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-all ${
                  !isVideoEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}

            <button 
              onClick={toggleSpeaker}
              className={`p-4 rounded-full transition-all ${
                isSpeakerOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>

            <button 
              onClick={endCall}
              className='bg-red-600 hover:bg-red-700 p-4 rounded-full transition-all'
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.684A1 1 0 008.28 3H5z" />
              </svg>
            </button>
          </div>

          {/* Call Duration Display */}
          <div className='absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm font-mono'>
            {formatCallTime(callDuration)}
          </div>
        </div>
      )}

      {/* INCOMING CALL MODAL */}
      {isReceivingCall && incomingCallInfo && (
        <div className='fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-300'>
          <div className='bg-gradient-to-br from-purple-900 to-violet-900 rounded-2xl p-6 sm:p-8 max-w-sm w-full mx-4 transform animate-in slide-in-from-bottom-4 duration-300'>
            <div className='text-center'>
              <div className='w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4 rounded-full overflow-hidden border-4 border-purple-400 animate-pulse'>
                <img 
                  src={selectedUser?.profilePic || assets.avatar_icon} 
                  alt={selectedUser?.fullName}
                  className='w-full h-full object-cover'
                />
              </div>
              <h3 className='text-white text-lg sm:text-xl font-semibold mb-1 px-2'>
                {truncateName(selectedUser?.fullName, isMobile() ? 15 : 25)}
              </h3>
              <p className='text-gray-300 text-xs sm:text-sm mb-4'>
                {incomingCallInfo.callType === 'video' ? '📹 Incoming video call' : '  Incoming audio call'}
              </p>
              
              <div className='flex gap-3 sm:gap-4 justify-center'>
                <button 
                  onClick={answerCall}
                  className='bg-green-600 hover:bg-green-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold transition-all flex items-center gap-2 text-sm sm:text-base'
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.684A1 1 0 008.28 3H5z" />
                  </svg>
                  Answer
                </button>
                <button 
                  onClick={endCall}
                  className='bg-red-600 hover:bg-red-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold transition-all text-sm sm:text-base'
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CALLING MODAL */}
      {isCalling && (
        <div className='fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-300'>
          <div className='bg-gradient-to-br from-purple-900 to-violet-900 rounded-2xl p-6 sm:p-8 max-w-sm w-full mx-4 text-center'>
            <div className='animate-pulse'>
              <div className='w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4 rounded-full overflow-hidden border-4 border-purple-400'>
                <img 
                  src={selectedUser?.profilePic || assets.avatar_icon} 
                  alt={selectedUser?.fullName}
                  className='w-full h-full object-cover'
                />
              </div>
            </div>
            <h3 className='text-white text-lg sm:text-xl font-semibold mb-2 px-2'>
              Calling {truncateName(selectedUser?.fullName, isMobile() ? 15 : 25)}...
            </h3>
            <p className='text-gray-300 text-xs sm:text-sm mb-4'>
              {callType === 'video' ? '📹 Video call' : '  Audio call'}
            </p>
            <button 
              onClick={endCall}
              className='bg-red-600 hover:bg-red-700 text-white px-5 sm:px-6 py-2 sm:py-2.5 rounded-full font-semibold transition-all text-sm sm:text-base'
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className='flex items-center gap-2 sm:gap-3 py-3 mx-3 sm:mx-4 border-b border-stone-500'>
        <img 
          src={selectedUser?.profilePic || assets.avatar_icon} 
          alt="profile pic" 
          className='w-8 h-8 rounded-full'
        />
        <p className='flex-1 text-base sm:text-lg text-white flex items-center gap-2'>
          <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
            {truncateName(selectedUser?.fullName, getNameMaxLength())}
          </span>
          {onlineUsers.includes(selectedUser?._id) && (
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse flex-shrink-0"></span>
          )}
        </p>
        
        {/* CALL BUTTONS - HIDDEN */}
        {/* <div className='flex gap-1 sm:gap-2'>
          <button 
            onClick={() => startCall('audio')}
            className='bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed'
            disabled={!onlineUsers.includes(selectedUser?._id) || isCallActive}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="hidden xs:inline">Audio</span>
          </button>
          
          <button 
            onClick={() => startCall('video')}
            className='bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed'
            disabled={!onlineUsers.includes(selectedUser?._id) || isCallActive}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="hidden xs:inline">Video</span>
          </button>
        </div> */}
        
        <img 
          onClick={() => setSelectedUser(null)} 
          src={assets.arrow_icon} 
          alt="" 
          className='md:hidden max-w-6 cursor-pointer'
        />
      </div>

      {/* CHAT AREA */}
      <div className='flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-6'>
        {messages.length > 0 ? messages.map((msg, index) => (
          <div 
            key={index} 
            className={`flex items-end gap-2 mb-4 ${msg.senderId !== authUser?._id ? 'justify-start' : 'justify-end'}`}
          >
            {msg.senderId !== authUser?._id && (
              <img 
                src={selectedUser?.profilePic || assets.avatar_icon} 
                alt="avatar" 
                className="w-7 h-7 rounded-full object-cover"
              />
            )}
            
            <div className='flex flex-col max-w-[70%] sm:max-w-[60%]'>
              {msg.image ? (
                <img src={msg.image} alt="shared" className='max-w-[200px] sm:max-w-[230px] border border-gray-500 rounded-lg overflow-hidden'/>
              ) : (
                <p className={`p-2 text-sm sm:text-base font-light rounded-lg break-words ${
                  msg.senderId !== authUser?._id 
                    ? 'bg-gray-700 text-white rounded-tl-none' 
                    : 'bg-gradient-to-r from-purple-400 to-violet-600 text-white rounded-tr-none'
                }`}>
                  {msg.text}
                </p>
              )}
              <p className='text-gray-500 text-xs mt-1'>
                {formatMessageTime(msg.createdAt)}
              </p>
            </div>
            
            {msg.senderId === authUser?._id && (
              <img 
                src={authUser?.profilePic || assets.avatar_icon} 
                alt="avatar" 
                className="w-7 h-7 rounded-full object-cover"
              />
            )}
          </div>
        )) : (
          <p className="text-gray-400 text-center mt-4">No messages yet</p>
        )}
        <div ref={scrollEnd}></div>
      </div>

      {/* BOTTOM AREA */}
      <div className='absolute bottom-0 left-0 right-0 flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gradient-to-t from-black/50 to-transparent'>
        <div className='flex-1 flex items-center bg-gray-100/12 px-3 rounded-full backdrop-blur-sm'>
          <input 
            onChange={(e) => setInput(e.target.value)} 
            value={input}
            onKeyDown={(e) => e.key === "Enter" ? handleSendMessage(e) : null}
            type="text" 
            placeholder='Type a message...' 
            className='flex-1 text-sm p-2 sm:p-3 border-none rounded-lg outline-none text-white bg-transparent'
          />
          <input onChange={handleSendImage} type="file" accept='image/png, image/jpeg, image/gif' id='image' hidden/>
          <label htmlFor="image" className='cursor-pointer'>
            <img src={assets.gallery_icon} alt="gallery" className='w-4 sm:w-5 mr-2 sm:mr-3 mt-2 sm:mt-3 opacity-70 hover:opacity-100 transition-opacity'/>
          </label>
        </div>
        <button 
          onClick={handleSendMessage} 
          className='bg-gradient-to-r from-purple-400 to-violet-600 rounded-full p-1.5 sm:p-2 hover:scale-105 transition-transform'
        >
          <img src={assets.send_button} alt="send" className='w-4 sm:w-5'/>
        </button>
      </div>
    </div>
  ) : (
    <div className='flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden h-full'>
      <img src={assets.logo_icon} alt="logo" className='max-w-16 opacity-50'/>
      <p className='text-lg font-medium text-white/70'>Let's chat as SOD anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer