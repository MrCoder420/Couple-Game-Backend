const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const supabase = require('./config/supabase');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/challenges', require('./routes/challenges'));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// SOCKET.IO REAL-TIME EVENTS
// ============================================

io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // Authenticate and join room
    socket.on('authenticate', async ({ token, roomId }) => {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            socket.userId = decoded.userId;
            socket.roomId = roomId;

            // Join Socket.IO room
            socket.join(roomId);

            // Update room history last accessed
            await supabase
                .from('user_room_history')
                .update({ last_accessed: new Date().toISOString() })
                .eq('user_id', decoded.userId)
                .eq('room_id', roomId);

            // Check if partner is already in the room
            const socketsInRoom = await io.in(roomId).fetchSockets();
            const partnerSocket = socketsInRoom.find(s => s.userId && s.userId !== decoded.userId);

            // Notify partner that this user is online
            socket.to(roomId).emit('partner_online', {
                userId: decoded.userId,
                status: 'online'
            });

            // If partner is online, notify this user too
            if (partnerSocket) {
                socket.emit('partner_online', {
                    userId: partnerSocket.userId,
                    status: 'online'
                });
                console.log(`[SOCKET] Both users now online in room ${roomId}`);
            }

            console.log(`[SOCKET] User ${decoded.userId} authenticated and joined room ${roomId}`);
        } catch (error) {
            console.error('[SOCKET] Auth error:', error);
            socket.emit('error', { message: 'Authentication failed' });
        }
    });

    // Challenge sent (notify receiver in real-time)
    socket.on('challenge_sent', async (challengeData) => {
        try {
            const { roomId, challengeId } = challengeData;

            // Get challenge details
            const { data: challenge } = await supabase
                .from('challenges')
                .select('*')
                .eq('id', challengeId)
                .single();

            if (challenge) {
                // Emit to receiver only
                socket.to(roomId).emit('challenge_received', challenge);
                console.log(`[SOCKET] Challenge ${challengeId} sent to room ${roomId}`);
            }
        } catch (error) {
            console.error('[SOCKET] Challenge sent error:', error);
        }
    });

    // Challenge responded (notify both players)
    socket.on('challenge_responded', async (responseData) => {
        try {
            const { roomId, challengeId } = responseData;

            // Get updated challenge
            const { data: challenge } = await supabase
                .from('challenges')
                .select('*')
                .eq('id', challengeId)
                .single();

            if (challenge) {
                // Emit to entire room
                io.to(roomId).emit('challenge_outcome', challenge);
                console.log(`[SOCKET] Challenge ${challengeId} outcome sent to room ${roomId}`);
            }
        } catch (error) {
            console.error('[SOCKET] Challenge responded error:', error);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${socket.id}`);

        if (socket.roomId && socket.userId) {
            // Notify partner that user is offline
            socket.to(socket.roomId).emit('partner_online', {
                userId: socket.userId,
                status: 'offline'
            });
        }
    });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n----------------------------------`);
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
    console.log(`----------------------------------`);
    console.log(`📡 REST API: http://localhost:${PORT}/api`);
    console.log(`🔌 Socket.IO: http://localhost:${PORT}`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log(`----------------------------------\n`);
});

module.exports = { app, server, io };
