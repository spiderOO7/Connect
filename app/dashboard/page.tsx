'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Plus, LogOut, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const [roomId, setRoomId] = useState('');
  const router = useRouter();

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      router.push(`/room/${roomId}`);
    }
  };

  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(7);
    router.push(`/room/${newRoomId}`);
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center">
            <Video className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-cyan-400">Connect Dashboard</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/profile')}
            className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
          >
            <User className="w-5 h-5" />
            <span>Profile</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Join Room Card */}
        <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 hover:border-cyan-500/50 transition-colors">
          <h2 className="text-xl font-semibold mb-4">Join a Room</h2>
          <p className="text-gray-400 mb-6">
            Enter a room ID to join an existing call or chat session.
          </p>
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter Room ID"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
            <button
              type="submit"
              disabled={!roomId.trim()}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Room
            </button>
          </form>
        </div>

        {/* Create Room Card */}
        <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 hover:border-cyan-500/50 transition-colors flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-4">Create New Room</h2>
            <p className="text-gray-400 mb-6">
              Start a new meeting and invite others to join you.
            </p>
          </div>
          <button
            onClick={createRoom}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Create Instant Meeting</span>
          </button>
        </div>
      </div>
    </div>
  );
}
