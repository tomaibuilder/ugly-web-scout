require('dotenv').config({ path: './config/.env' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: String(process.env.DATABASE_URL),
});

module.exports = pool;
