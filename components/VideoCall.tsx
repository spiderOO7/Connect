'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  PhoneOff, 
  Copy, 
  Send, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff,
  Users,
  MessageCircle
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import Peer, { MediaConnection } from 'peerjs';

// TypeScript interfaces for type safety
interface Message {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  senderId: string;
}

interface CallState {
  isInCall: boolean;
  isConnecting: boolean;
  remotePeerId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const VideoCall = () => {
  // State management for the application
  const [peer, setPeer] = useState<Peer | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [remotePeerIdInput, setRemotePeerIdInput] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);
  const [callState, setCallState] = useState<CallState>({
    isInCall: false,
    isConnecting: false,
    remotePeerId: '',
    localStream: null,
    remoteStream: null
  });

  // Video element references
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize peer connection and socket on component mount
  useEffect(() => {
    initializePeerConnection();
    initializeSocketConnection();
    generateUsername();

    return () => {
      // Cleanup on component unmount
      if (peer) {
        peer.destroy();
      }
      if (socket) {
        socket.disconnect();
      }
      if (callState.localStream) {
        callState.localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-scroll chat messages to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateUsername = () => {
    const adjectives = ['Cool', 'Smart', 'Happy', 'Bright', 'Swift'];
    const nouns = ['User', 'Person', 'Friend', 'Caller', 'Guest'];
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNumber = Math.floor(Math.random() * 1000);
    setUsername(`${randomAdjective}${randomNoun}${randomNumber}`);
  };

  const initializePeerConnection = async () => {
    try {
      // Request media permissions early
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      // Create new Peer instance connecting to the public PeerJS server
      const newPeer = new Peer({
        host: window.location.hostname,
        port: 9000,
        path: '/myapp',
        secure: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      // Handle peer connection establishment
      newPeer.on('open', (id) => {
        console.log('Peer connection established with ID:', id);
        setMyPeerId(id);
        
        // Set local video stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        setCallState(prev => ({ ...prev, localStream: stream }));
      });

      // Handle incoming call
      newPeer.on('call', (call) => {
        console.log('Receiving incoming call...');
        setCallState(prev => ({ ...prev, isConnecting: true }));
        
        // Answer the call with our local stream
        call.answer(stream);
        currentCallRef.current = call;

        // Handle remote stream
        call.on('stream', (remoteStream) => {
          console.log('Received remote stream');
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          setCallState(prev => ({
            ...prev,
            isInCall: true,
            isConnecting: false,
            remoteStream,
            remotePeerId: call.peer
          }));
        });

        // Handle call close
        call.on('close', () => {
          console.log('Call ended by remote peer');
          endCall();
        });
      });

      // Handle peer errors
      newPeer.on('error', (error) => {
        console.error('Peer error:', error);
      });

      setPeer(newPeer);
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Please allow camera and microphone access to use this application.');
    }
  };

  const initializeSocketConnection = () => {
    // Connect to our Socket.IO server
    const newSocket = io(`http://${window.location.hostname}:3001`, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Socket.IO connected');
      // Join a common room for chat
      newSocket.emit('join-room', { 
        roomId: 'general', 
        username: username || 'Anonymous'
      });
    });

    // Handle incoming messages
    newSocket.on('receive-message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    newSocket.on('user-joined', (data) => {
      console.log(`User ${data.username} joined the room`);
    });

    newSocket.on('user-left', (data) => {
      console.log(`User ${data.username} left the room`);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });

    setSocket(newSocket);
  };

  // Initiate outgoing call
  const callPeer = () => {
    if (!peer || !callState.localStream || !remotePeerIdInput.trim()) {
      alert('Please enter a valid Peer ID');
      return;
    }

    console.log('Calling peer:', remotePeerIdInput);
    setCallState(prev => ({ ...prev, isConnecting: true }));

    // Make the call
    const call = peer.call(remotePeerIdInput, callState.localStream);
    currentCallRef.current = call;

    // Handle remote stream
    call.on('stream', (remoteStream) => {
      console.log('Received remote stream from outgoing call');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setCallState(prev => ({
        ...prev,
        isInCall: true,
        isConnecting: false,
        remoteStream,
        remotePeerId: remotePeerIdInput
      }));
    });

    // Handle call close
    call.on('close', () => {
      console.log('Call ended by remote peer');
      endCall();
    });

    // Handle call error
    call.on('error', (error) => {
      console.error('Call error:', error);
      setCallState(prev => ({ ...prev, isConnecting: false }));
      alert('Failed to connect to peer. Please check the Peer ID.');
    });
  };

  // End the current call
  const endCall = () => {
    if (currentCallRef.current) {
      currentCallRef.current.close();
      currentCallRef.current = null;
    }

    // Clear remote video
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setCallState(prev => ({
      ...prev,
      isInCall: false,
      isConnecting: false,
      remoteStream: null,
      remotePeerId: ''
    }));
  };

  // Toggle audio mute
  const toggleAudio = () => {
    if (callState.localStream) {
      const audioTrack = callState.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle video on/off
  const toggleVideo = () => {
    if (callState.localStream) {
      const videoTrack = callState.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Copy peer ID to clipboard
  const copyPeerId = async () => {
    try {
      await navigator.clipboard.writeText(myPeerId);
      alert('Peer ID copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Send chat message
  const sendMessage = () => {
    if (!socket || !messageInput.trim()) return;

    socket.emit('send-message', {
      author: username,
      content: messageInput.trim()
    });

    setMessageInput('');
  };

  // Handle Enter key press in message input
  const handleMessageKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-cyan-400">Connect</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400">Welcome, {username}</span>
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-cyan-400">
                {callState.isInCall ? 'In Call' : 'Available'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        {/* Video Section */}
        <div className="flex-1 lg:flex-[2] p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            {/* Local Video */}
            <div className="relative bg-gray-800 rounded-xl overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4">
                <span className="bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                  You
                </span>
              </div>
              {isVideoOff && (
                <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                  <VideoOff className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>

            {/* Remote Video */}
            <div className="relative bg-gray-800 rounded-xl overflow-hidden">
              {callState.isInCall ? (
                <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-4 left-4">
                    <span className="bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                      Remote Peer
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">
                      {callState.isConnecting ? 'Connecting...' : 'Waiting for peer...'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6 space-y-4">
            {/* Peer ID Display */}
            <div className="bg-gray-800 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Your Peer ID:
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={myPeerId}
                  readOnly
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={copyPeerId}
                  className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            {/* Call Controls */}
            <div className="bg-gray-800 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Connect to Peer:
              </label>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <input
                  type="text"
                  placeholder="Paste peer ID here to start call"
                  value={remotePeerIdInput}
                  onChange={(e) => setRemotePeerIdInput(e.target.value)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                {!callState.isInCall ? (
                  <button
                    onClick={callPeer}
                    disabled={callState.isConnecting}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{callState.isConnecting ? 'Connecting...' : 'Call'}</span>
                  </button>
                ) : (
                  <button
                    onClick={endCall}
                    className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Call</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Share your Peer ID above with someone, then paste their ID here to connect
              </p>
            </div>

            {/* Media Controls */}
            {callState.isInCall && (
              <div className="flex justify-center space-x-4">
                <button
                  onClick={toggleAudio}
                  className={`p-3 rounded-full transition-colors ${
                    isAudioMuted 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {isAudioMuted ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-full transition-colors ${
                    isVideoOff 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {isVideoOff ? (
                    <VideoOff className="w-5 h-5" />
                  ) : (
                    <Video className="w-5 h-5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chat Panel */}
        <div className="lg:flex-1 bg-gray-800 border-l border-gray-700">
          <div className="h-full flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center space-x-2">
                <MessageCircle className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-cyan-400">Chat</h3>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.author === username ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-sm px-4 py-2 rounded-lg ${
                      message.author === username
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    <div className="text-xs opacity-75 mb-1">
                      {message.author} · {formatTime(message.timestamp)}
                    </div>
                    <div>{message.content}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-700">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleMessageKeyPress}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                <button
                  onClick={sendMessage}
                  className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;