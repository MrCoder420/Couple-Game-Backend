# Couple Game Backend 💕

Backend server for the Couple Game - a romantic challenge game for couples to deepen their connection through engaging challenges and questions.

## Features

- 🔐 **Authentication** - User registration and login with JWT tokens
- 🎮 **Room Management** - Create and join game rooms with unique codes
- 🎯 **Challenge System** - Multiple challenge types including questions, dares, and creative tasks
- 🔄 **Real-time Communication** - Socket.IO for live game updates
- 💾 **Supabase Integration** - PostgreSQL database with real-time capabilities
- 📊 **Score Tracking** - Track player scores and game progress

## Tech Stack

- **Node.js** & **Express.js** - Backend framework
- **Socket.IO** - Real-time bidirectional communication
- **Supabase** - PostgreSQL database and authentication
- **JWT** - Secure authentication tokens
- **CORS** - Cross-origin resource sharing

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase account and project

## Installation

1. Clone the repository:
```bash
git clone https://github.com/MrCoder420/Couple-Game-Backend.git
cd Couple-Game-Backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
JWT_SECRET=your_jwt_secret_key
PORT=3000
```

4. Set up the database:
```bash
# Run the SQL scripts in your Supabase SQL editor
# 1. First run: supabase/init_schema.sql
# 2. Then run: supabase/disable_rls.sql (if needed for development)
```

## Running the Server

### Development Mode
```bash
npm start
```

The server will start on `http://localhost:3000`

### Available Scripts
- `npm start` - Start the server with nodemon (auto-restart on changes)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with email and password

### Rooms
- `POST /api/rooms` - Create a new game room
- `POST /api/rooms/:code/join` - Join a room with code
- `GET /api/rooms/:id` - Get room details

### Challenges
- `GET /api/challenges` - Get all challenges
- `GET /api/challenges/:id` - Get specific challenge
- `POST /api/challenges` - Create new challenge (admin)

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile

## Socket.IO Events

### Client → Server
- `join_room` - Join a game room
- `leave_room` - Leave current room
- `start_game` - Start the game
- `submit_answer` - Submit challenge answer
- `next_challenge` - Request next challenge

### Server → Client
- `room_joined` - Confirmation of room join
- `player_joined` - New player joined room
- `player_left` - Player left room
- `game_started` - Game has started
- `new_challenge` - New challenge received
- `answer_submitted` - Answer was submitted
- `game_over` - Game ended

## Project Structure

```
backend/
├── config/
│   └── supabase.js          # Supabase configuration
├── controllers/
│   ├── gameController.js    # Game logic
│   └── roomController.js    # Room management
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── challenges.js       # Challenge routes
│   ├── rooms.js            # Room routes
│   └── users.js            # User routes
├── middleware/
│   └── auth.js             # JWT authentication middleware
├── socket/
│   └── index.js            # Socket.IO setup and handlers
├── supabase/
│   ├── init_schema.sql     # Database schema
│   └── disable_rls.sql     # Disable RLS for development
├── utils/
│   └── rooms.js            # Room utility functions
├── data/
│   └── cards.js            # Challenge card data
├── index.js                # Main server file
├── server.js               # Express server setup
└── api-server.js           # API routes setup
```

## Database Schema

### Tables
- **users** - User accounts and profiles
- **rooms** - Game room information
- **players** - Player-room relationships
- **challenges** - Challenge cards and questions
- **game_sessions** - Active game sessions
- **answers** - Player answers and scores

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_KEY` | Supabase anonymous key | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `PORT` | Server port (default: 3000) | No |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Support

For issues and questions, please open an issue on GitHub.

---

Made with ❤️ for couples everywhere
