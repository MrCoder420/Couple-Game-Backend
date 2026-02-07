const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ROOM_ID = 'f2781218-a199-42d7-9e24-7ae737f58d3b';

async function checkDeck() {
    console.log('Checking decks for room:', ROOM_ID);

    const { data: decks, error } = await supabase
        .from('player_decks')
        .select('*')
        .eq('room_id', ROOM_ID);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!decks || decks.length === 0) {
        console.log('❌ NO DECKS FOUND for this room!');
        return;
    }

    decks.forEach((d, i) => {
        console.log(`\n--- Deck ${i + 1} ---`);
        console.log('User ID:', d.user_id);
        console.log('Total Cards:', d.cards ? d.cards.length : 0);
        console.log('Used IDs Count:', d.used_card_ids ? d.used_card_ids.length : 0);
        console.log('Used IDs:', d.used_card_ids);
    });
}

checkDeck();
