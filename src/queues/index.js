require('dotenv').config({ path: './config/.env' });
const { Queue } = require('bullmq');

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;

if (!REDIS_HOST || !REDIS_PORT) {
    console.warn(`Warning: REDIS_HOST (${REDIS_HOST}) or REDIS_PORT (${REDIS_PORT}) environment variables are not fully set for Audit Queue. Defaulting may be used or connection might fail.`);
    // No process.exit(1) here for same reasons as enrichmentQueue
}

const auditQueue = new Queue('audit-queue', {
    connection: {
        host: REDIS_HOST || '127.0.0.1',
        port: parseInt(REDIS_PORT || '6379', 10),
    },
});

auditQueue.on('error', (error) => {
    console.error('BullMQ Audit Queue Error:', error);
});

module.exports = auditQueue;
