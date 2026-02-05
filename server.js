const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const setupSocket = require('./socket');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins (Mobile + Web)
        methods: ["GET", "POST"]
    }
});

// Initialize Socket Logic
setupSocket(io);

const PORT = 3000;
// Listen on 0.0.0.0 to accept connections from LAN (Mobile)
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n----------------------------------`);
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
    console.log(`----------------------------------`);
    console.log(`Ensure your mobile app connects to your PC's IP address!`);
    console.log(`Example: http://192.168.1.X:${PORT}`);
    console.log(`----------------------------------\n`);
});
