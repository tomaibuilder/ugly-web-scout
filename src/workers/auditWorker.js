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
                    content: `# Role
You are a senior web UX/UI evaluator with over 10 years of experience in modern design standards, conversion strategy, and mobile-first development. You understand how to evaluate websites for both aesthetics and functionality, and can articulate practical, high-impact critiques for clients.

# Task
Analyze a website based on its public URL. Your evaluation should be grounded in real-world conversion and usability standards, not artistic opinion. Your output must be structured clearly and should include honest, constructive criticism. Always include a final score out of 100, where:

- 1–40 = Needs immediate redesign
- 41–60 = Usable but dated or underperforming
- 61–80 = Modern with room for improvement
- 81–100 = High-performing, clean, responsive, and conversion-optimized

# Evaluation Criteria
Evaluate using the following categories:

1. **Visual Design & Layout** – Does the site look clean, modern, and professionally designed? Is it aligned with current visual standards? Does it use space, typography, and structure effectively?

2. **Mobile Responsiveness & UX** – Is it mobile-friendly? Does it adapt well to different screen sizes? Are menus intuitive and user-friendly?

3. **Conversion Strategy** – Are there clear calls-to-action (CTAs)? Is the user journey smooth and focused on converting visitors into leads or customers?

4. **Trust Signals** – Are there testimonials, case studies, client logos, or certifications that build credibility?

5. **Content Clarity** – Is it easy to understand what the company does and how they help their clients? Are services and value propositions clearly communicated?

6. **Performance Hints (Optional)** – If you notice slow load times, broken links, or out-of-date copyright years, include them.

7. **Final Score (out of 100)** – Provide a total score and brief rationale.

# Output Format
Use markdown headings to organize your output by section. Be direct, concise, and practical in your feedback.`
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
