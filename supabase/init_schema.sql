-- Couple Card Game - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- ROOMS TABLE
-- ============================================
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(6) UNIQUE NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
    duration_days INTEGER DEFAULT 7,
    start_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_created_by ON rooms(created_by);
CREATE INDEX idx_rooms_partner_id ON rooms(partner_id);

-- ============================================
-- PLAYER DECKS TABLE
-- ============================================
CREATE TABLE player_decks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    cards JSONB NOT NULL,
    used_card_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

CREATE INDEX idx_player_decks_room ON player_decks(room_id);
CREATE INDEX idx_player_decks_user ON player_decks(user_id);

-- ============================================
-- CHALLENGES TABLE
-- ============================================
CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    card_id VARCHAR(255) NOT NULL,
    card_content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_challenges_room ON challenges(room_id);
CREATE INDEX idx_challenges_receiver ON challenges(receiver_id);
CREATE INDEX idx_challenges_status ON challenges(status);

-- ============================================
-- GAME EVENTS TABLE
-- ============================================
CREATE TABLE game_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_game_events_room ON game_events(room_id);
CREATE INDEX idx_game_events_created ON game_events(created_at DESC);

-- ============================================
-- USER ROOM HISTORY TABLE
-- ============================================
CREATE TABLE user_room_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_favorite BOOLEAN DEFAULT false,
    UNIQUE(user_id, room_id)
);

CREATE INDEX idx_user_room_history_user ON user_room_history(user_id);
CREATE INDEX idx_user_room_history_accessed ON user_room_history(last_accessed DESC);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_room_history ENABLE ROW LEVEL SECURITY;

-- Users: Can read their own data
CREATE POLICY "Users can read own data" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Rooms: Can read rooms they're part of
CREATE POLICY "Users can read their rooms" ON rooms
    FOR SELECT USING (
        auth.uid()::text = created_by::text OR 
        auth.uid()::text = partner_id::text
    );

CREATE POLICY "Users can create rooms" ON rooms
    FOR INSERT WITH CHECK (auth.uid()::text = created_by::text);

CREATE POLICY "Users can update their rooms" ON rooms
    FOR UPDATE USING (
        auth.uid()::text = created_by::text OR 
        auth.uid()::text = partner_id::text
    );

-- Player Decks: Can read own deck
CREATE POLICY "Users can read own deck" ON player_decks
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own deck" ON player_decks
    FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Challenges: Can read challenges in their rooms
CREATE POLICY "Users can read room challenges" ON challenges
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rooms 
            WHERE rooms.id = challenges.room_id 
            AND (rooms.created_by::text = auth.uid()::text OR rooms.partner_id::text = auth.uid()::text)
        )
    );

CREATE POLICY "Users can create challenges" ON challenges
    FOR INSERT WITH CHECK (auth.uid()::text = sender_id::text);

CREATE POLICY "Users can update received challenges" ON challenges
    FOR UPDATE USING (auth.uid()::text = receiver_id::text);

-- Game Events: Can read events in their rooms
CREATE POLICY "Users can read room events" ON game_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rooms 
            WHERE rooms.id = game_events.room_id 
            AND (rooms.created_by::text = auth.uid()::text OR rooms.partner_id::text = auth.uid()::text)
        )
    );

-- User Room History: Can read own history
CREATE POLICY "Users can read own history" ON user_room_history
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own history" ON user_room_history
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own history" ON user_room_history
    FOR UPDATE USING (auth.uid()::text = user_id::text);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate unique 6-digit room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    new_code VARCHAR(6);
    code_exists BOOLEAN;
BEGIN
    LOOP
        new_code := LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');
        SELECT EXISTS(SELECT 1 FROM rooms WHERE code = new_code) INTO code_exists;
        EXIT WHEN NOT code_exists;
    END LOOP;
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- INSERT INTO users (email, display_name) VALUES 
--     ('user1@example.com', 'Player 1'),
--     ('user2@example.com', 'Player 2');
