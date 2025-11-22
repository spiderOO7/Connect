const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Store active rooms and users
const rooms = new Map();
const users = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle joining a room
  socket.on('join-room', (data) => {
    const { roomId, username } = data;
    
    socket.join(roomId);
    users.set(socket.id, { roomId, username });
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);
    
    console.log(`User ${username} (${socket.id}) joined room ${roomId}`);
    
    // Emit to other users in the room that someone joined
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      username
    });
  });

  // Handle sending messages
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (user) {
      const messageData = {
        id: Date.now().toString(),
        author: data.author,
        content: data.content,
        timestamp: new Date().toISOString(),
        senderId: socket.id
      };
      
      // Broadcast to all users in the same room
      io.to(user.roomId).emit('receive-message', messageData);
      console.log(`Message from ${data.author} in room ${user.roomId}: ${data.content}`);
    }
  });

  // Handle peer connection signaling
  socket.on('peer-signal', (data) => {
    const user = users.get(socket.id);
    if (user) {
      socket.to(user.roomId).emit('peer-signal', {
        ...data,
        senderId: socket.id
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const { roomId, username } = user;
      
      // Remove user from room
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        }
      }
      
      // Notify other users in the room
      socket.to(roomId).emit('user-left', {
        userId: socket.id,
        username
      });
      
      console.log(`User ${username} (${socket.id}) disconnected from room ${roomId}`);
    }
    
    users.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});