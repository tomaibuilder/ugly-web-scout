require('dotenv').config({ path: './config/.env' });
const { Worker } = require('bullmq');
const db = require('../db');
const axios = require('axios');

const auditCache = new Map();

const worker = new Worker('audit-queue', async (job) => {
    const { url } = job.data;
    console.log('Processing job:', job.id, url);

    const domain = new URL(url).hostname;
    if (auditCache.has(domain)) {
        console.log(`Cache hit for ${domain}. Skipping audit.`);
        return;
    }

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a web design auditor. Analyze the given URL and return a JSON object with the following structure: { "score": <0-100>, "quadrant": <"Ugly", "Poor", "Good", "Excellent">, "reasons": ["reason1", "reason2"] }'
                },
                {
                    role: 'user',
                    content: `Audit the website at this URL: ${url}`
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });

        const auditResult = response.data.choices[0].message.content;
        const { score, quadrant, reasons } = JSON.parse(auditResult);

        await db.query(
            'INSERT INTO audits (url, score, quadrant, reasons) VALUES ($1, $2, $3, $4)',
            [url, score, quadrant, JSON.stringify(reasons)]
        );

        auditCache.set(domain, true); // Cache the domain to prevent re-auditing

        console.log(`Audit for ${url} completed and saved to the database.`);

    } catch (error) {
        console.error(`Error processing job ${job.id} for url ${url}:`, error);
        throw error; // This will cause the job to be retried
    }

}, {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
    },
    concurrency: 50, // Process up to 50 audits in parallel
});

console.log('Worker started');
