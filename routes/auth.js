const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * POST /api/auth/login
 * Email-only login (no password)
 */
router.post('/login', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        // Check if user exists
        let { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        // If user doesn't exist, create them
        if (!user) {
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([{
                    email,
                    display_name: email.split('@')[0], // Use email prefix as display name
                    last_login: new Date().toISOString()
                }])
                .select()
                .single();

            if (createError) {
                console.error('User creation error:', createError);
                return res.status(500).json({ error: 'Failed to create user' });
            }

            user = newUser;
        } else {
            // Update last login
            await supabase
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', user.id);
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * GET /api/auth/me (requires auth)
 */
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', decoded.userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name
            }
        });

    } catch (error) {
        console.error('Auth me error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
