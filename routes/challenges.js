const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/challenges
 * Send a challenge
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { roomId, cardId, cardContent } = req.body;

        if (!roomId || !cardId || !cardContent) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get room to find receiver
        const { data: room } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        const receiverId = room.created_by === req.userId ? room.partner_id : room.created_by;

        // Create challenge
        const { data: challenge, error } = await supabase
            .from('challenges')
            .insert([{
                room_id: roomId,
                sender_id: req.userId,
                receiver_id: receiverId,
                card_id: cardId,
                card_content: cardContent,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) {
            console.error('Challenge creation error:', error);
            return res.status(500).json({ error: 'Failed to send challenge' });
        }

        // Log event
        await supabase
            .from('game_events')
            .insert([{
                room_id: roomId,
                event_type: 'challenge_sent',
                data: { challengeId: challenge.id, cardId, senderId: req.userId }
            }]);

        res.json({ challenge });

    } catch (error) {
        console.error('Send challenge error:', error);
        res.status(500).json({ error: 'Failed to send challenge' });
    }
});

/**
 * PUT /api/challenges/:id/respond
 * Respond to a challenge
 */
router.put('/:id/respond', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { response } = req.body; // 'accept' or 'reject'

        if (!['accept', 'reject'].includes(response)) {
            return res.status(400).json({ error: 'Invalid response' });
        }

        console.log(`[API] Respond to challenge ${id}. User: ${req.userId}, Response: ${response}`);

        // Update challenge
        const { data: challenge, error } = await supabase
            .from('challenges')
            .update({
                status: response === 'accept' ? 'accepted' : 'rejected',
                responded_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('receiver_id', req.userId) // Ensure only receiver can respond
            .select()
            .single();

        if (error) console.error('[API] Update error:', error);
        if (!challenge) console.error('[API] Challenge not found or user not receiver');
        else console.log('[API] Challenge updated:', challenge.status);

        if (error || !challenge) {
            return res.status(404).json({ error: 'Challenge not found' });
        }

        // Log event
        await supabase
            .from('game_events')
            .insert([{
                room_id: challenge.room_id,
                event_type: `challenge_${response}ed`,
                data: { challengeId: id, responderId: req.userId }
            }]);

        let penalty = null;

        // Apply penalty if rejected
        if (response === 'reject') {
            const isPenaltyForReceiver = Math.random() > 0.5;

            penalty = {
                type: isPenaltyForReceiver ? 'lose_card' : 'partner_bonus',
                targetId: isPenaltyForReceiver ? req.userId : challenge.sender_id,
                description: isPenaltyForReceiver
                    ? 'Penalty: You lost a random card!'
                    : 'Penalty: Partner got a bonus card!'
            };

            // Log penalty event
            await supabase
                .from('game_events')
                .insert([{
                    room_id: challenge.room_id,
                    event_type: 'penalty_applied',
                    data: penalty
                }]);
        }

        res.json({ challenge, penalty });

    } catch (error) {
        console.error('Respond challenge error:', error);
        res.status(500).json({ error: 'Failed to respond to challenge' });
    }
});

/**
 * GET /api/challenges/pending
 * Get pending challenges for user
 */
router.get('/pending', authMiddleware, async (req, res) => {
    try {
        const { roomId } = req.query;

        let query = supabase
            .from('challenges')
            .select('*')
            .eq('receiver_id', req.userId)
            .eq('status', 'pending')
            .order('sent_at', { ascending: false });

        if (roomId) {
            query = query.eq('room_id', roomId);
        }

        const { data: challenges, error } = await query;

        if (error) {
            console.error('Get pending challenges error:', error);
            return res.status(500).json({ error: 'Failed to get challenges' });
        }

        res.json({ challenges: challenges || [] });

    } catch (error) {
        console.error('Get challenges error:', error);
        res.status(500).json({ error: 'Failed to get challenges' });
    }
});

module.exports = router;
