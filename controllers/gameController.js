const { rooms } = require('../utils/rooms');

const sendChallenge = (io, socket, data) => {
    console.log(`[GAME-DEBUG] Backend received 'send_challenge' from ${socket.id}`);
    console.log(`[GAME-DEBUG] Data:`, JSON.stringify(data, null, 2));

    const { roomCode, card } = data;

    if (!rooms.has(roomCode)) {
        console.error(`[GAME-ERROR] Room ${roomCode} NOT FOUND.`);
        return;
    }

    const room = rooms.get(roomCode);
    const senderId = socket.id;
    const receiverId = room.players.find(id => id !== senderId);

    if (!receiverId) {
        console.error(`[GAME-ERROR] No partner found in room ${roomCode}.`);
        return;
    }

    const challenge = {
        id: 'ch_' + Date.now(),
        senderId,
        receiverId,
        card,
        status: 'pending',
        sentAt: new Date().toISOString()
    };

    // Notify receiver
    io.to(receiverId).emit('challenge_received', challenge);
    console.log(`[GAME-DEBUG] Sent 'challenge_received' to ${receiverId}`);
};

const respondChallenge = (io, socket, data) => {
    console.log(`[GAME-DEBUG] Response received:`, data);
    const { roomCode, challengeId, response } = data;
    const room = rooms.get(roomCode);
    if (!room) return;

    // Logic: If reject -> Penalty
    let penaltyDetails = null;
    if (response === 'reject') {
        // Simple penalty: Respondant loses a random card from their deck? 
        // Or Sender gets a bonus. Let's send a "penalty" event.
        penaltyDetails = {
            type: 'card_loss',
            message: 'Rejection Penalty: You lost a card!'
        };
    }

    const event = {
        type: 'challenge_response',
        challengeId,
        response, // 'accept' or 'reject'
        responderId: socket.id,
        timestamp: new Date().toISOString()
    };

    if (response === 'accept') {
        io.to(roomCode).emit('challenge_outcome', event);
    } else {
        io.to(roomCode).emit('challenge_outcome', { ...event, penalty: penaltyDetails });
    }
};

module.exports = { sendChallenge, respondChallenge };
