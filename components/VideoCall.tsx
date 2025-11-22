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
import { supabase } from '@/lib/supabase';

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

interface VideoCallProps {
  roomId: string;
}

const VideoCall = ({ roomId }: VideoCallProps) => {
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
    initializePeerConnection();
    initializeSocketConnection();
    fetchUserProfile();
    fetchMessages();

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

  const fetchUserProfile = async () => {
    if (!supabase) {
      generateUsername();
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', user.id)
        .single();
      
      if (data?.full_name || data?.username) {
        setUsername(data.full_name || data.username || 'User');
      } else {
        generateUsername();
      }
    } else {
      generateUsername();
    }
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
      const peerPort = process.env.NEXT_PUBLIC_PEER_PORT 
        ? parseInt(process.env.NEXT_PUBLIC_PEER_PORT) 
        : 9000;

      const newPeer = new Peer({
        host: window.location.hostname,
        port: peerPort,
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
        roomId: roomId, 
        username: username || 'Anonymous'
      });
    });

    // Handle incoming messages
    newSocket.on('receive-message', (message: Message) => {
      // Only add message if it's from someone else, or if we haven't added it optimistically (though here we rely on server)
      // Actually, simpler fix: The server broadcasts to everyone. 
      // If we want to avoid duplication, we should check if we already have this message ID? 
      // Or better: The server sends it back. We just render it. 
      // The issue might be that we are fetching from Supabase AND getting live updates?
      // Ah, fetchMessages gets history. Live updates get new ones.
      // If we send a message, it goes to Supabase AND Socket.
      // If we are getting double, maybe we are adding it locally in sendMessage? No, we aren't.
      // Wait, the user said "text coming twice". 
      // If I reload, I get history. Then I send.
      // Maybe the server emits twice? Or the component mounts twice (React Strict Mode)?
      // Let's deduplicate by ID.
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
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

  // Fetch messages from Supabase
  const fetchMessages = async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else if (data) {
      setMessages(data);
    }
  };

  // Send chat message
  const sendMessage = async () => {
    if (!socket || !messageInput.trim()) return;

    const messageData = {
      id: Date.now().toString(), // Generate ID locally for optimistic update/deduplication
      author: username,
      content: messageInput.trim(),
      timestamp: new Date().toISOString(),
      senderId: socket.id || 'unknown',
      room_id: roomId
    };

    // Save to Supabase
    if (supabase) {
      const { error } = await supabase
        .from('messages')
        .insert([messageData]);

      if (error) {
        console.error('Error saving message to Supabase:', error);
      }
    }

    // Emit to Socket.IO for realtime (optional if using Supabase Realtime, but keeping for now)
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-6 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
        <div className="flex items-center space-x-3 pointer-events-auto">
          <div className="w-10 h-10 bg-cyan-500/20 backdrop-blur-md border border-cyan-500/50 rounded-xl flex items-center justify-center">
            <Video className="w-6 h-6 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Connect</h1>
        </div>
        <div className="flex items-center space-x-4 pointer-events-auto">
          <div className="bg-black/30 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-gray-200">
              {callState.isInCall ? 'Connected' : 'Ready'}
            </span>
          </div>
        </div>
      </header>

      <div className="flex h-screen pt-20 pb-24 px-6 gap-6">
        {/* Video Grid */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Local Video */}
            <div className="relative bg-gray-800/50 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl group">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
              <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                <span className="text-sm font-medium text-white">You ({username})</span>
              </div>
              <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {isAudioMuted && (
                  <div className="p-2 bg-red-500/90 rounded-lg">
                    <MicOff className="w-4 h-4 text-white" />
                  </div>
                )}
                {isVideoOff && (
                  <div className="p-2 bg-red-500/90 rounded-lg">
                    <VideoOff className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            </div>

            {/* Remote Video */}
            <div className="relative bg-gray-800/50 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
              {callState.isInCall ? (
                <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                    <span className="text-sm font-medium text-white">Remote Peer</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <div className="w-20 h-20 bg-gray-700/50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <Users className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Waiting for connection</h3>
                  <p className="text-gray-400 max-w-xs">
                    Share your Peer ID to start a call
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        <div className="w-96 bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/10 bg-white/5">
            <div className="flex items-center space-x-2">
              <MessageCircle className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-white">Live Chat</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.author === username ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-baseline space-x-2 mb-1">
                  <span className="text-xs font-medium text-gray-400">{message.author}</span>
                  <span className="text-[10px] text-gray-600">{formatTime(message.timestamp)}</span>
                </div>
                <div
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    message.author === username
                      ? 'bg-cyan-600 text-white rounded-tr-none'
                      : 'bg-gray-800 text-gray-100 rounded-tl-none'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-white/10 bg-white/5">
            <div className="relative">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={handleMessageKeyPress}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-4 pr-12 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all"
              />
              <button
                onClick={sendMessage}
                className="absolute right-2 top-2 p-1.5 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Control Bar */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex items-center space-x-2 shadow-2xl">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-xl transition-all duration-200 ${
              isAudioMuted 
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
                : 'bg-gray-800/50 text-white hover:bg-gray-700/50'
            }`}
            title={isAudioMuted ? "Unmute" : "Mute"}
          >
            {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`p-4 rounded-xl transition-all duration-200 ${
              isVideoOff 
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
                : 'bg-gray-800/50 text-white hover:bg-gray-700/50'
            }`}
            title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>

          <div className="w-px h-8 bg-white/10 mx-2" />

          {!callState.isInCall ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Enter Peer ID"
                value={remotePeerIdInput}
                onChange={(e) => setRemotePeerIdInput(e.target.value)}
                className="w-40 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 outline-none"
              />
              <button
                onClick={callPeer}
                disabled={callState.isConnecting}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center space-x-2"
              >
                <Phone className="w-5 h-5" />
                <span>Call</span>
              </button>
            </div>
          ) : (
            <button
              onClick={endCall}
              className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-xl font-medium transition-colors flex items-center space-x-2"
            >
              <PhoneOff className="w-5 h-5" />
              <span>End</span>
            </button>
          )}

          <div className="w-px h-8 bg-white/10 mx-2" />

          <button
            onClick={copyPeerId}
            className="p-4 rounded-xl bg-gray-800/50 text-white hover:bg-gray-700/50 transition-all"
            title="Copy My ID"
          >
            <Copy className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;