require('dotenv').config({ path: './config/.env' });
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL environment variable is not set. Database connection cannot be established.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: String(DATABASE_URL), // Ensure it's a string
});

pool.on('connect', () => {
    console.log('Successfully connected to the PostgreSQL database.');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client in PostgreSQL pool', err);
    // process.exit(-1); // Optionally exit if pool errors are critical
});

module.exports = pool;
