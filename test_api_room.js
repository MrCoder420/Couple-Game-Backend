const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_URL = 'http://10.94.159.181:3000/api';
const SECRET = process.env.JWT_SECRET;
const ROOM_ID = 'f2781218-a199-42d7-9e24-7ae737f58d3b';
const USER_ID = '6ee643fd-1352-49ff-9ad8-19a1ee766cbc';
const EMAIL = 'nikhilbhor21@gmail.com';

const token = jwt.sign(
    { id: USER_ID, email: EMAIL },
    SECRET,
    { expiresIn: '1h' }
);

async function testRoom() {
    try {
        console.log(`Fetching room ${ROOM_ID}...`);
        const res = await fetch(`${API_URL}/rooms/${ROOM_ID}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            console.log('Room Status:', data.room.status);

            if (data.deck) {
                console.log('Deck Found!');
                console.log('Cards Type:', Array.isArray(data.deck.cards) ? 'Array' : typeof data.deck.cards);
                console.log('Cards Length:', data.deck.cards ? data.deck.cards.length : 'N/A');
                console.log('Used IDs:', data.deck.used_card_ids);

                if (data.deck.cards && data.deck.cards.length > 0) {
                    console.log('Sample Card:', JSON.stringify(data.deck.cards[0], null, 2));
                }
            } else {
                console.log('❌ NO DECK in response');
            }
        } else {
            console.log('Error:', await res.text());
        }
    } catch (e) {
        console.error('Fetch Failed:', e.message);
    }
}

testRoom();
