const { rooms } = require('../utils/rooms');
const { data } = require('../data/cards');

// Generate unique 6-digit code
const generateRoomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const getRandomCards = () => {
    // 30 cards per deck
    const shuffled = [...data].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 30);
};

// Helper to format deck with fixed cards
const createPlayerDeck = (userId, randomCards) => {
    const fixedTypes = ['skip', 'swap', 'reverse', 'shield', 'reveal'];
    const cards = [];

    // Add Fixed Cards
    fixedTypes.forEach(type => {
        cards.push({
            id: `card_${userId}_${type}`,
            type,
            content: `Use this to ${type} a challenge!`,
            isFixed: true,
        });
    });

    // Add Random Cards
    randomCards.forEach(c => {
        cards.push({
            ...c,
            id: `card_${userId}_${c.id}`, // Unique ID for this game instance
            isFixed: false
        });
    });

    // Shuffle
    const shuffled = cards.sort(() => 0.5 - Math.random());

    return {
        userId,
        cards: shuffled,
        usedCardIds: []
    };
};

const createRoom = (io, socket) => {
    const roomCode = generateRoomCode();

    // Get raw pools
    const deck1Raw = getRandomCards();
    const deck2Raw = getRandomCards();

    // Format into proper Deck Objects
    const finalDeck1 = createPlayerDeck(socket.id, deck1Raw);
    const finalDeck2 = createPlayerDeck('pending_player_2', deck2Raw);

    const roomData = {
        players: [socket.id],
        decks: {
            [socket.id]: finalDeck1
        },
        gameState: {
            day: 1,
            score: 0,
            streak: 0,
            history: []
        },
        createdAt: Date.now()
    };

    // Store deck for second player
    roomData.decks['pending_player_2'] = finalDeck2;

    rooms.set(roomCode, roomData);
    socket.join(roomCode);

    console.log(`[ROOM] Room created: ${roomCode} by ${socket.id}`);

    // Send room code back
    socket.emit('room_created', roomCode);

    // Send full deck object
    socket.emit('game_state_update', {
        game: roomData.gameState,
        deck: finalDeck1
    });
};

const joinRoom = (io, socket, roomCode) => {
    if (!rooms.has(roomCode)) {
        socket.emit('error', 'Room not found');
        return;
    }

    const room = rooms.get(roomCode);

    if (room.players.length >= 2) {
        socket.emit('error', 'Room is full');
        return;
    }

    room.players.push(socket.id);

    // Retrieve pre-generated formatted deck for P2
    const p2Deck = room.decks['pending_player_2'];
    delete room.decks['pending_player_2'];

    // Update the ID in the deck object
    p2Deck.userId = socket.id;
    // Update IDs for uniqueness (simple string replace for now)
    p2Deck.cards = p2Deck.cards.map(c => ({
        ...c,
        id: c.id.replace('pending_player_2', socket.id)
    }));

    room.decks[socket.id] = p2Deck;

    socket.join(roomCode);
    console.log(`[ROOM] User ${socket.id} joined room ${roomCode}`);

    // Notify P1 partner joined
    io.to(roomCode).emit('player_joined', { playerCount: room.players.length });

    if (room.players.length === 2) {
        console.log(`[ROOM] Room ${roomCode} is now FULL. Starting game.`);
        io.to(roomCode).emit('game_ready');

        // Send decks individually
        io.to(room.players[0]).emit('initial_deck', room.decks[room.players[0]]);
        io.to(room.players[1]).emit('initial_deck', room.decks[room.players[1]]);
    }
};

module.exports = { createRoom, joinRoom };
