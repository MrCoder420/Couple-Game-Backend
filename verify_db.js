const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; // Or SERVICE_ROLE_KEY if available for backend

console.log('Testing Supabase Connection...');
console.log('URL:', supabaseUrl);
console.log('Key length:', supabaseKey ? supabaseKey.length : 0);

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDB() {
    try {
        console.log('\n--- 1. Testing Read Users ---');
        const { data: users, error: userError } = await supabase.from('users').select('id, email').limit(1);
        if (userError) throw userError;
        console.log('✅ Read Users success:', users.length, 'records found');

        console.log('\n--- 2. Testing Insert Challenge ---');
        // We need a valid user and room ID ideally, but let's try with dummy UUIDs if no constraints
        // Or fetch a real room first
        const { data: rooms } = await supabase.from('rooms').select('id, created_by').limit(1);

        if (rooms && rooms.length > 0) {
            const roomId = rooms[0].id;
            const userId = rooms[0].created_by;

            console.log(`Using Room: ${roomId}, User: ${userId}`);

            const testChallenge = {
                room_id: roomId,
                sender_id: userId,
                receiver_id: userId, // self test
                card_id: 'test_card_123',
                card_content: 'TEST DATABASE INSERT',
                status: 'pending',
                sent_at: new Date().toISOString()
            };

            const { data: inserted, error: insertError } = await supabase
                .from('challenges')
                .insert([testChallenge])
                .select()
                .single();

            if (insertError) {
                console.error('❌ Insert Challenge Failed:', insertError);
            } else {
                console.log('✅ Insert Challenge Success:', inserted.id);

                // cleanup
                console.log('Cleaning up test record...');
                await supabase.from('challenges').delete().eq('id', inserted.id);
                console.log('✅ Cleanup done');
            }

        } else {
            console.log('⚠️ No rooms found to test specific FK constraints, skipping insert test.');
        }

    } catch (err) {
        console.error('❌ DB Test Failed:', err);
    }
}

testDB();
