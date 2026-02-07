const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function showHistory() {
    try {
        console.log('--- 🏠 ROOMS TABLE CONTENT 🏠 ---');
        const { data: rooms, error: roomError } = await supabase
            .from('rooms')
            .select('*');

        if (roomError) console.error('Error fetching rooms:', roomError);
        else {
            console.table(rooms.map(r => ({
                ID: r.id.substring(0, 8),
                Code: r.code,
                Creator: r.created_by ? r.created_by.substring(0, 8) : 'NULL',
                Partner: r.partner_id ? r.partner_id.substring(0, 8) : 'NULL ⚠️',
                Status: r.status
            })));
        }

        console.log('\n--- 📊 CHALLENGES TABLE CONTENT 📊 ---');

        // Fetch all challenges, ordered by newest first
        const { data: challenges, error } = await supabase
            .from('challenges')
            .select('*')
            .order('sent_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching history:', error.message);
            return;
        }

        if (!challenges || challenges.length === 0) {
            console.log('📭 Table is EMPTY');
        } else {
            console.table(challenges.map(c => ({
                ID: c.id.substring(0, 8),
                Room: c.room_id ? c.room_id.substring(0, 8) : 'NULL',
                Sender: c.sender_id ? c.sender_id.substring(0, 8) : 'NULL',
                Receiver: c.receiver_id ? c.receiver_id.substring(0, 8) : 'MISSING', // Critical check
                CardID: c.card_id,
                Status: c.status,
                Time: c.sent_at ? new Date(c.sent_at).toLocaleTimeString() : 'N/A'
            })));
        }

        console.log(`\nTotal Records: ${challenges ? challenges.length : 0}`);
        console.log('----------------------------------------');

    } catch (err) {
        console.error('UNEXPECTED ERROR:', err);
    }
}

showHistory();
