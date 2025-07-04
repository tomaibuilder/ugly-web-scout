require('dotenv').config({ path: './config/.env' });
const { Queue } = require('bullmq');

const enrichmentQueue = new Queue('enrichment-queue', {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
    },
});

module.exports = enrichmentQueue;
