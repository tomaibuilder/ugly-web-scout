require('dotenv').config({ path: './config/.env' });
const { Queue } = require('bullmq');

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;

if (!REDIS_HOST || !REDIS_PORT) {
    console.warn(`Warning: REDIS_HOST (${REDIS_HOST}) or REDIS_PORT (${REDIS_PORT}) environment variables are not fully set for Enrichment Queue. Defaulting may be used or connection might fail.`);
    // No process.exit(1) here, as BullMQ might use defaults or fail on its own,
    // but the warning helps debugging.
}

const enrichmentQueue = new Queue('enrichment-queue', {
    connection: {
        host: REDIS_HOST || '127.0.0.1',
        port: parseInt(REDIS_PORT || '6379', 10),
    },
});

enrichmentQueue.on('error', (error) => {
    console.error('BullMQ Enrichment Queue Error:', error);
});

module.exports = enrichmentQueue;
