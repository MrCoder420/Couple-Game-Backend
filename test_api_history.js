const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_URL = 'http://10.94.159.181:3000/api';
const SECRET = process.env.JWT_SECRET;

const USER_ID = '6ee643fd-1352-49ff-9ad8-19a1ee766cbc';
const EMAIL = 'nikhilbhor21@gmail.com';
const ROOM_ID = 'f2781218-a199-42d7-9e24-7ae737f58d3b';

const token = jwt.sign(
    { id: USER_ID, email: EMAIL },
    SECRET,
    { expiresIn: '1h' }
);

async function testHistory() {
    try {
        console.log('Testing GET /history for room:', ROOM_ID);
        const res = await fetch(`${API_URL}/rooms/${ROOM_ID}/history`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Response Status:', res.status);

        if (res.ok) {
            const data = await res.json();
            console.log('Challenges Found:', data.challenges.length);
            console.log('Events Found:', data.events.length);

            if (data.challenges.length > 0) {
                console.log('First Challenge:', data.challenges[0]);
            } else {
                console.log('⚠️ No challenges returned (Empty Array)');
            }
        } else {
            const txt = await res.text();
            console.error('Error Response:', txt);
        }

    } catch (error) {
        console.error('Fetch Error:', error.message);
    }
}

testHistory();
