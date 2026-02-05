const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/rooms
 * Create a new room
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { duration_days = 7 } = req.body;

        // Generate room code using DB function
        const { data: codeData } = await supabase.rpc('generate_room_code');
        const code = codeData;

        // Create room
        const { data: room, error } = await supabase
            .from('rooms')
            .insert([{
                code,
                created_by: req.userId,
                duration_days,
                status: 'waiting'
            }])
            .select()
            .single();

        if (error) {
            console.error('Room creation error:', error);
            return res.status(500).json({ error: 'Failed to create room' });
        }

        // Generate deck for creator
        const deck = await generateDeck(req.userId);

        const { error: deckError } = await supabase
            .from('player_decks')
            .insert([{
                room_id: room.id,
                user_id: req.userId,
                cards: deck.cards,
                used_card_ids: []
            }]);

        if (deckError) {
            console.error('Deck creation error:', deckError);
        }

        // Add to user history
        await supabase
            .from('user_room_history')
            .insert([{
                user_id: req.userId,
                room_id: room.id
            }]);

        res.json({ room, code });

    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

/**
 * POST /api/rooms/join
 * Join existing room
 */
router.post('/join', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Room code required' });
        }

        // Find room
        const { data: room, error: fetchError } = await supabase
            .from('rooms')
            .select('*')
            .eq('code', code)
            .single();

        if (fetchError || !room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (room.partner_id) {
            return res.status(400).json({ error: 'Room is full' });
        }

        // Update room with partner
        const { data: updatedRoom, error: updateError } = await supabase
            .from('rooms')
            .update({
                partner_id: req.userId,
                status: 'active',
                start_date: new Date().toISOString()
            })
            .eq('id', room.id)
            .select()
            .single();

        if (updateError) {
            console.error('Room join error:', updateError);
            return res.status(500).json({ error: 'Failed to join room' });
        }

        // Generate deck for joiner
        const deck = await generateDeck(req.userId);

        const { error: deckError } = await supabase
            .from('player_decks')
            .insert([{
                room_id: room.id,
                user_id: req.userId,
                cards: deck.cards,
                used_card_ids: []
            }]);

        if (deckError) {
            console.error('Deck creation error:', deckError);
        }

        // Add to user history
        await supabase
            .from('user_room_history')
            .insert([{
                user_id: req.userId,
                room_id: room.id
            }]);

        // Get the deck
        const { data: playerDeck } = await supabase
            .from('player_decks')
            .select('*')
            .eq('room_id', room.id)
            .eq('user_id', req.userId)
            .single();

        res.json({ room: updatedRoom, deck: playerDeck });

    } catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ error: 'Failed to join room' });
    }
});

/**
 * GET /api/rooms/:roomId
 * Get room details
 */
router.get('/:roomId', authMiddleware, async (req, res) => {
    try {
        const { roomId } = req.params;

        const { data: room, error } = await supabase
            .from('rooms')
            .select(`
                *,
                creator:users!rooms_created_by_fkey(id, email, display_name),
                partner:users!rooms_partner_id_fkey(id, email, display_name)
            `)
            .eq('id', roomId)
            .single();

        if (error || !room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Get user's deck
        const { data: deck } = await supabase
            .from('player_decks')
            .select('*')
            .eq('room_id', roomId)
            .eq('user_id', req.userId)
            .single();

        res.json({ room, deck });

    } catch (error) {
        console.error('Get room error:', error);
        res.status(500).json({ error: 'Failed to get room' });
    }
});

/**
 * GET /api/rooms/:roomId/history
 * Get room game history
 */
router.get('/:roomId/history', authMiddleware, async (req, res) => {
    try {
        const { roomId } = req.params;

        const { data: challenges } = await supabase
            .from('challenges')
            .select('*')
            .eq('room_id', roomId)
            .order('sent_at', { ascending: false });

        const { data: events } = await supabase
            .from('game_events')
            .select('*')
            .eq('room_id', roomId)
            .order('created_at', { ascending: false });

        res.json({ challenges: challenges || [], events: events || [] });

    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get history' });
    }
});

/**
 * Helper: Generate deck
 */
async function generateDeck(userId) {
    const { data: cardPool } = await supabase
        .from('cards')
        .select('*');

    // Use default cards if no pool exists
    const defaultCards = require('../data/cards').data || [];
    const pool = cardPool && cardPool.length > 0 ? cardPool : defaultCards;

    // Shuffle and pick 25 random
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const randomCards = shuffled.slice(0, 25);

    // Add fixed special cards
    const fixedTypes = ['skip', 'swap', 'reverse', 'shield', 'reveal'];
    const cards = [];

    fixedTypes.forEach(type => {
        cards.push({
            id: `card_${userId}_${type}`,
            type,
            content: `Use this to ${type} a challenge!`,
            isFixed: true
        });
    });

    randomCards.forEach(c => {
        cards.push({
            ...c,
            id: `card_${userId}_${c.id}`,
            isFixed: false
        });
    });

    return {
        userId,
        cards: cards.sort(() => 0.5 - Math.random()),
        usedCardIds: []
    };
}

module.exports = router;
