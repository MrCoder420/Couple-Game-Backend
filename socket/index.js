const { createRoom, joinRoom } = require('../controllers/roomController');
const { sendChallenge, respondChallenge } = require('../controllers/gameController');
const { rooms } = require('../utils/rooms');

const setupSocket = (io) => {
    io.on('connection', (socket) => {
        console.log(`[CONN] User connected: ${socket.id}`);

        // Room Handlers
        socket.on('create_room', () => createRoom(io, socket));
        socket.on('join_room', (code) => joinRoom(io, socket, code));

        // Game Handlers
        socket.on('send_challenge', (data) => sendChallenge(io, socket, data));
        socket.on('respond_challenge', (data) => respondChallenge(io, socket, data));

        // Disconnect Handler
        socket.on('disconnect', () => {
            console.log(`[CONN] User disconnected: ${socket.id}`);
            // Cleanup: Remove user from any rooms
            rooms.forEach((room, roomCode) => {
                if (room.players.includes(socket.id)) {
                    // Remove player
                    room.players = room.players.filter(id => id !== socket.id);
                    console.log(`[CLEANUP] Removed ${socket.id} from room ${roomCode}. Remaining: ${room.players.length}`);

                    if (room.players.length > 0) {
                        io.to(roomCode).emit('player_left', { playerCount: room.players.length });
                    } else {
                        console.log(`[CLEANUP] Room ${roomCode} is empty. Deleting.`);
                        rooms.delete(roomCode);
                    }
                }
            });
        });
    });
};

module.exports = setupSocket;
