require('dotenv').config({ path: './config/.env' });
const { Queue } = require('bullmq');

const queue = new Queue('audit-queue', {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
    },
});

module.exports = queue;
