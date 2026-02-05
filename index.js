const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity during dev
        methods: ["GET", "POST"]
    }
});

// Store rooms in memory
// Key: Room Code (string), Value: { players: string[], ready: boolean }
const rooms = new Map();

// Helper to generate 6-digit code
function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const CARDS_POOL = require('./data/cards');

// Helper to shuffle array
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // CREATE ROOM
    socket.on('create_room', () => {
        const roomCode = generateRoomCode();
        // Generate Decks for P1 & P2 immediately to ensure uniqueness
        const allCards = shuffle([...CARDS_POOL]); // Shuffle full pool

        // Take 25 for P1
        const p1Random = allCards.slice(0, 25);
        // Take next 25 for P2 (no overlap)
        const p2Random = allCards.slice(25, 50);

        const fixedTypes = ['skip', 'swap', 'reverse', 'shield', 'reveal'];

        const createDeck = (userId, randomCards) => {
            const cards = [];
            // Add Fixed
            fixedTypes.forEach(type => {
                cards.push({
                    id: `card_${userId}_${type}`,
                    type,
                    content: `Use this to ${type} a challenge!`,
                    isFixed: true,
                });
            });
            // Add Random
            randomCards.forEach(c => {
                cards.push({
                    ...c,
                    id: `card_${userId}_${c.id}`, // Unique ID for this game instance
                    isFixed: false
                });
            });
            return { userId, cards: shuffle(cards), usedCardIds: [] };
        };

        const roomData = {
            players: [socket.id],
            decks: {} // Will be keyed by socketID when they join
        };

        // Pre-calculate decks (store them temporarily until P2 joins or assign now?)
        // Better: Assign P1 deck now. Assign P2 deck later but reserve the cards.
        // Actually, let's store the 'reserved' card sets in room state.
        roomData.p1Cards = p1Random;
        roomData.p2Cards = p2Random;

        // Finalize P1 Deck
        roomData.decks[socket.id] = createDeck(socket.id, p1Random);

        rooms.set(roomCode, roomData);
        socket.join(roomCode);

        console.log(`Room created: ${roomCode} by ${socket.id}`);
        // Send ONLY P1's deck to P1
        socket.emit('room_created', roomCode); // Client will ask for deck or we send it?
        // Let's send init data
        socket.emit('game_state_update', { deck: roomData.decks[socket.id] });
    });

    // JOIN ROOM
    socket.on('join_room', (roomCode) => {
        if (rooms.has(roomCode)) {
            const room = rooms.get(roomCode);

            if (room.players.length >= 2) {
                socket.emit('error', 'Room is full');
                return;
            }

            room.players.push(socket.id);
            socket.join(roomCode); // Join socket room

            // Assign P2 Deck
            // We need to access the createDeck helper, or duplicated logic. 
            // Let's refactor createDeck out or duplicte for MVP speed if simple.
            // Re-defining helper here for scope access (or move out):
            const fixedTypes = ['skip', 'swap', 'reverse', 'shield', 'reveal'];
            const createDeck = (userId, randomCards) => {
                const cards = [];
                fixedTypes.forEach(type => {
                    cards.push({ id: `card_${userId}_${type}`, type, content: `Use this to ${type} a challenge!`, isFixed: true });
                });
                randomCards.forEach(c => {
                    cards.push({ ...c, id: `card_${userId}_${c.id}`, isFixed: false });
                });
                return { userId, cards: shuffle(cards), usedCardIds: [] };
            };

            room.decks[socket.id] = createDeck(socket.id, room.p2Cards);

            console.log(`User ${socket.id} joined room ${roomCode}`);

            // Notify P1 partner joined
            io.to(roomCode).emit('player_joined', { playerCount: room.players.length });

            if (room.players.length === 2) {
                io.to(roomCode).emit('game_ready');

                // Send decks
                io.to(room.players[0]).emit('initial_deck', room.decks[room.players[0]]);
                io.to(room.players[1]).emit('initial_deck', room.decks[room.players[1]]);
            }

        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // GAMEPLAY: SEND CHALLENGE
    socket.on('send_challenge', (data) => {
        console.log(`[DEBUG] Backend received 'send_challenge' from ${socket.id}`);
        console.log(`[DEBUG] Challenge Data:`, JSON.stringify(data, null, 2));

        const { roomCode, card } = data;

        if (!rooms.has(roomCode)) {
            console.error(`[ERROR] Room ${roomCode} NOT FOUND. Existing rooms:`, [...rooms.keys()]);
            return;
        }

        const room = rooms.get(roomCode);
        console.log(`[DEBUG] Room ${roomCode} found. Players:`, room.players);

        const senderId = socket.id;
        const receiverId = room.players.find(id => id !== senderId);

        if (!receiverId) {
            console.error(`[ERROR] No receiver found in room ${roomCode}. Is the partner connected?`);
            // Optional: Emit error back to sender
            return;
        }

        console.log(`[DEBUG] Routing challenge: Sender=${senderId} -> Receiver=${receiverId}`);

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
        console.log(`[DEBUG] Emitted 'challenge_received' to SOCKET ${receiverId}`);
        console.log(`[DEBUG] Payload size: ${JSON.stringify(challenge).length} chars`);
    });

    // GAMEPLAY: RESPOND TO CHALLENGE
    socket.on('respond_challenge', (data) => {
        // data: { roomCode, challengeId, response } response = 'accept' | 'reject'
        const { roomCode, challengeId, response } = data;
        const room = rooms.get(roomCode);
        if (!room) return;

        // Logic to apply consequences
        // We broadcast the result to both players so history can be updated

        const event = {
            type: 'challenge_response',
            challengeId,
            response, // 'accept' or 'reject'
            responderId: socket.id,
            timestamp: new Date().toISOString()
        };

        if (response === 'accept') {
            // Just notify success
            io.to(roomCode).emit('challenge_outcome', event);
        } else {
            // REJECT -> PENALTY
            // Penalty A: Partner (Rejector) loses a random card
            // Penalty B: Sender (Challenger) gets a bonus card
            const isPenaltyA = Math.random() > 0.5;
            let penaltyDetails = {};

            if (isPenaltyA) {
                // Lose Card logic
                // We need to tell the Rejector (socket.id) to remove a card
                // Server should strictly manage this, but for MVP we send command
                penaltyDetails = {
                    type: 'lose_card',
                    targetId: socket.id,
                    description: 'Penalty: You lost a random card!'
                };
            } else {
                // Bonus Card logic
                // Sender (not socket.id) gets a card
                const senderId = room.players.find(id => id !== socket.id);
                // Pick a random card from pool that is NOT in sender's deck (simplified: just random from pool)
                const bonusCard = CARDS_POOL[Math.floor(Math.random() * CARDS_POOL.length)];

                penaltyDetails = {
                    type: 'partner_bonus',
                    targetId: senderId,
                    description: 'Penalty: Partner got a bonus card!',
                    bonusCard: { ...bonusCard, id: `bonus_${Date.now()}`, isFixed: false }
                };
            }

            io.to(roomCode).emit('challenge_outcome', { ...event, penalty: penaltyDetails });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Cleanup: Remove user from any rooms
        rooms.forEach((room, roomCode) => {
            if (room.players.includes(socket.id)) {
                // Remove player
                room.players = room.players.filter(id => id !== socket.id);
                console.log(`Removed ${socket.id} from room ${roomCode}. Remaining: ${room.players.length}`);

                // Notify remaining player
                if (room.players.length > 0) {
                    io.to(roomCode).emit('player_left', { playerCount: room.players.length });
                } else {
                    // Room empty, maybe delete? 
                    // Keep for a bit or delete? Let's keep for now but reset?
                    // Safe to delete if we want to save memory
                    console.log(`Room ${roomCode} is empty. Deleting.`);
                    rooms.delete(roomCode);
                }
            }
        });
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
