require('dotenv').config({ path: './config/.env' });
const { Worker } = require('bullmq');
const db = require('../db');
const axios = require('axios');

const worker = new Worker('audit-queue', async (job) => {
    const { url } = job.data;
    console.log('Processing job:', job.id, url);

    try {
        // Check for existing audit in the database
        const { rows } = await db.query('SELECT * FROM audits WHERE url = $1', [url]);
        if (rows.length > 0) {
            console.log(`Cache hit for ${url}. Skipping audit.`);
            return;
        }

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o',
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
        let score, quadrant, reasons;

        try {
            const parsedResult = JSON.parse(auditResult);
            score = parsedResult.score;
            quadrant = parsedResult.quadrant;
            reasons = parsedResult.reasons;
        } catch (e) {
            console.error(`Error parsing JSON for job ${job.id}:`, auditResult);
            // Optionally, you could try to extract the JSON from a larger string
            const jsonMatch = auditResult.match(/\{.*\}/s);
            if (jsonMatch) {
                try {
                    const parsedResult = JSON.parse(jsonMatch[0]);
                    score = parsedResult.score;
                    quadrant = parsedResult.quadrant;
                    reasons = parsedResult.reasons;
                } catch (e2) {
                    console.error(`Still failed to parse JSON for job ${job.id} after extraction.`);
                    throw new Error('Invalid JSON response from OpenAI');
                }
            } else {
                throw new Error('No JSON object found in the response from OpenAI');
            }
        }


        await db.query(
            'INSERT INTO audits (url, score, quadrant, reasons) VALUES ($1, $2, $3, $4)',
            [url, score, quadrant, JSON.stringify(reasons)]
        );

        console.log(`Audit for ${url} completed and saved to the database.`);

    } catch (error) {
        console.error(`Error processing job ${job.id} for url ${url}:`, error.message);
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
