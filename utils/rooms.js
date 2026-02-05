// Helper to manage ephemeral in-memory state
// In a real app, use Redis or Database
const rooms = new Map();

module.exports = { rooms };
