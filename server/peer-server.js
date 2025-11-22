const { PeerServer } = require('peer');
const dotenv = require('dotenv');

// Load environment variables from .env.local or .env
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const port = process.env.NEXT_PUBLIC_PEER_PORT || 9000;

const peerServer = PeerServer({
  port: parseInt(port),
  path: '/myapp',
  key: 'peerjs',
  proxied: true
});

console.log(`PeerJS server running on port ${port}`);
