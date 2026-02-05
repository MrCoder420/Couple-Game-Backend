const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/users/me
 * Get current user with room history
 */
router.get('/me', authMiddleware, async (req, res) => {
    try {
        // Get user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.userId)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get room history
        const { data: history } = await supabase
            .from('user_room_history')
            .select(`
                *,
                room:rooms(
                    *,
                    creator:users!rooms_created_by_fkey(display_name),
                    partner:users!rooms_partner_id_fkey(display_name)
                )
            `)
            .eq('user_id', req.userId)
            .order('last_accessed', { ascending: false })
            .limit(10);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name
            },
            rooms: history || []
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

module.exports = router;
