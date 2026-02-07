const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const supabase = require('./config/supabase'); // Ensure this path is correct
const authMiddleware = require('./middleware/auth'); // Ensure this path is correct

// Load env
dotenv.config();

// Init Express
const app = express();
const server = http.createServer(app);

// Init Socket.IO
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all for dev
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/challenges', require('./routes/challenges'));

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// ============================================
// SOCKET.IO LOGIC
// ============================================

io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // Authentication (simple handshake or event)
    socket.on('authenticate', async ({ token, roomId }) => {
        try {
            console.log(`[SOCKET] Authenticating... Room: ${roomId}`);

            // ---------------------------------------------------------
            // CRITICAL FIX: Verify Token & Handle Legacy vs New Payload
            // ---------------------------------------------------------
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            console.log('[SOCKET] Decoded Token:', JSON.stringify(decoded));

            // Support both new 'id' and legacy 'userId' formatted tokens
            socket.userId = decoded.id || decoded.userId;
            socket.roomId = roomId;

            if (!socket.userId) {
                console.error('[SOCKET] Auth failed - No user ID found in token keys:', Object.keys(decoded));
                socket.emit('error', { message: 'Invalid token structure' });
                return;
            }

            console.log(`[SOCKET] Auth Success! User: ${socket.userId}, Room: ${socket.roomId}`);

            // Start Tracking Presence
            socket.join(roomId);

            // Notify partner
            socket.to(roomId).emit('partner_online', { userId: socket.userId, status: 'online' });

            // Check room occupancy to trigger game start
            const clients = io.sockets.adapter.rooms.get(roomId);
            const playerCount = clients ? clients.size : 0;

            console.log(`[SOCKET] Room ${roomId} has ${playerCount} players`);

            // Emit player_joined to everyone in room (including self, though frontend might ignore self)
            io.to(roomId).emit('player_joined', { playerCount });

            if (playerCount >= 2) {
                console.log(`[SOCKET] Both users online in room ${roomId} -> Game Ready`);
                io.to(roomId).emit('game_ready');

                // Optional: Emit initial deck/state if needed here, 
                // but frontend loads dashboard data via API on 'game_ready'
            }

        } catch (error) {
            console.error('[SOCKET] Auth failed:', error.message);
            socket.emit('error', { message: 'Authentication failed' });
        }
    });

    // Challenge sent (notify partner) - Simplified event
    socket.on('send_challenge', (challenge) => {
        try {
            if (socket.roomId) {
                socket.to(socket.roomId).emit('challenge_received', challenge);
                console.log(`[SOCKET] Challenge sent to room ${socket.roomId}`);
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

    // Send card to partner (The main game action)
    socket.on('send_card', async (card) => {
        try {
            console.log(`[SOCKET] send_card received. SocketUser: ${socket.userId}, Room: ${socket.roomId}`);

            if (!socket.roomId) {
                console.error('[SOCKET] Send card aborted - No room joined');
                return;
            }
            if (!socket.userId) {
                console.error('[SOCKET] Send card aborted - No User ID (Auth failed previously)');
                socket.emit('error', { message: 'Authentication missing. Please restart app.' });
                return;
            }

            // PERSIST TO DATABASE

            // Get room to identify partner more reliably than room_members
            const { data: room } = await supabase
                .from('rooms')
                .select('*')
                .eq('id', socket.roomId)
                .single();

            let partnerId = null;
            if (room) {
                // If I am creator, partner is partner_id. If I am partner, partner is created_by.
                partnerId = room.created_by === socket.userId ? room.partner_id : room.created_by;
            }

            console.log(`[SOCKET] Persisting challenge. Sen: ${socket.userId}, Rec: ${partnerId}`);

            const { data: savedChallenge, error: saveError } = await supabase
                .from('challenges')
                .insert([{
                    room_id: socket.roomId,
                    sender_id: socket.userId,
                    receiver_id: partnerId,
                    card_id: card.id,
                    card_content: card.content,
                    status: 'pending',
                    sent_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (saveError) {
                console.error('[SOCKET] Failed to save challenge to DB:', saveError);
            } else {
                console.log('[SOCKET] Challenge saved to DB:', savedChallenge.id);
            }

            // Broadcast card to partner with DB format
            const payload = savedChallenge ? {
                ...card,
                id: savedChallenge.id, // Update ID to match DB
                senderId: socket.userId,
                receiverId: partnerId,
                cardId: card.id, // Ensure frontend maps this
                sentAt: savedChallenge.sent_at,
                status: 'pending'
            } : card;

            socket.to(socket.roomId).emit('receive_card', payload);
            socket.emit('card_sent_success', payload);

            console.log(`[SOCKET] Card sent to partner in room ${socket.roomId}`);
        } catch (error) {
            console.error('[SOCKET] Send card error:', error);
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
