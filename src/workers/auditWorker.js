require('dotenv').config({ path: './config/.env' });
const { Worker } = require('bullmq');
const db = require('../db');
const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

if (!OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set.");
    process.exit(1); // Exit if key is missing
}

const worker = new Worker('audit-queue', async (job) => {
    const { url } = job.data;
    console.log(`Processing job: ${job.id} for URL: ${url}`);

    try {
        // Check for existing audit in the database (cache check)
        const { rows } = await db.query('SELECT * FROM audits WHERE url = $1', [url]);
        if (rows.length > 0) {
            console.log(`Cache hit for ${url} (Job ID: ${job.id}). Skipping audit.`);
            return;
        }
        console.log(`Cache miss for ${url} (Job ID: ${job.id}). Proceeding with OpenAI audit.`);

        let apiResponse;
        try {
            apiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o', // Ensure this model is appropriate and available
                messages: [
                    {
                        role: 'system',
                        content: 'You are a web design auditor. Analyze the given URL and return ONLY a JSON object with the following structure: { "score": <0-100>, "quadrant": <"Ugly", "Poor", "Good", "Excellent">, "reasons": ["reason1", "reason2"] }. Do not include any explanatory text before or after the JSON object.'
                    },
                    {
                        role: 'user',
                        content: `Audit the website at this URL: ${url}`
                    }
                ],
                response_format: { type: "json_object" }, // Request JSON response from OpenAI
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 second timeout for OpenAI API call
            });
        } catch (axiosError) {
            console.error(`OpenAI API request failed for job ${job.id} (URL: ${url}). Status: ${axiosError.response?.status}`);
            console.error("Error details:", axiosError.response?.data || axiosError.message);
            // Rethrow to let BullMQ handle retry logic based on its configuration
            throw new Error(`OpenAI API request failed: ${axiosError.response?.status} - ${axiosError.response?.data?.error?.message || axiosError.message}`);
        }

        console.log(`Raw OpenAI API response data for job ${job.id}:`, JSON.stringify(apiResponse.data, null, 2));

        if (!apiResponse.data || !apiResponse.data.choices || apiResponse.data.choices.length === 0) {
            console.error(`Invalid OpenAI response structure for job ${job.id} (URL: ${url}): Missing choices.`);
            throw new Error('Invalid OpenAI response structure: Missing choices.');
        }

        const auditResultText = apiResponse.data.choices[0].message?.content;

        if (!auditResultText) {
            console.error(`Invalid OpenAI response for job ${job.id} (URL: ${url}): No content in message.`);
            throw new Error('Invalid OpenAI response: No content in message.');
        }

        console.log(`Audit result text from OpenAI for job ${job.id} (URL: ${url}):\n${auditResultText}`);

        let score, quadrant, reasons;
        try {
            // OpenAI gpt-4o with response_format: { type: "json_object" } should return valid JSON.
            const parsedResult = JSON.parse(auditResultText);
            score = parsedResult.score;
            quadrant = parsedResult.quadrant;
            reasons = parsedResult.reasons;

            if (typeof score !== 'number' || typeof quadrant !== 'string' || !Array.isArray(reasons)) {
                console.error(`Parsed JSON has incorrect structure for job ${job.id} (URL: ${url}):`, parsedResult);
                throw new Error('Parsed JSON has incorrect structure.');
            }

        } catch (parseError) {
            console.error(`Error parsing JSON response from OpenAI for job ${job.id} (URL: ${url}). Error: ${parseError.message}. Raw text: "${auditResultText}"`);
            // Attempt to extract JSON from a potentially larger string (less likely with json_object mode)
            const jsonMatch = auditResultText.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
                try {
                    console.log(`Attempting to parse extracted JSON for job ${job.id}: ${jsonMatch[0]}`);
                    const parsedResult = JSON.parse(jsonMatch[0]);
                    score = parsedResult.score;
                    quadrant = parsedResult.quadrant;
                    reasons = parsedResult.reasons;

                    if (typeof score !== 'number' || typeof quadrant !== 'string' || !Array.isArray(reasons)) {
                         console.error(`Fallback parsed JSON has incorrect structure for job ${job.id} (URL: ${url}):`, parsedResult);
                        throw new Error('Fallback parsed JSON has incorrect structure.');
                    }
                    console.log(`Successfully parsed extracted JSON for job ${job.id}.`);
                } catch (fallbackParseError) {
                    console.error(`Still failed to parse JSON for job ${job.id} after extraction. Error: ${fallbackParseError.message}`);
                    throw new Error('Invalid JSON response from OpenAI even after attempting extraction.');
                }
            } else {
                throw new Error(`No valid JSON object found in the response from OpenAI. Raw text: "${auditResultText}"`);
            }
        }

        await db.query(
            'INSERT INTO audits (url, score, quadrant, reasons, audit_data_raw) VALUES ($1, $2, $3, $4, $5)',
            [url, score, quadrant, JSON.stringify(reasons), auditResultText] // Storing raw result too
        );

        console.log(`Audit for ${url} (Job ID: ${job.id}) completed and saved to the database.`);

    } catch (error) {
        // Log the final error that caused the job to fail
        console.error(`Failed to process job ${job.id} for url ${url}. Error: ${error.message}`);
        // Add error details to the job itself if possible, or to a separate error log
        // job.updateData({ ...job.data, error: error.message }); // Example
        throw error; // This will cause BullMQ to retry the job based on its settings
    }

}, {
    connection: {
        host: REDIS_HOST,
        port: REDIS_PORT,
    },
    concurrency: 50, // Process up to 50 audits in parallel
    // Default job options can be set here, like attempts for retries
    // defaultJobOptions: {
    //   attempts: 3,
    //   backoff: {
    //     type: 'exponential',
    //     delay: 10000, // 10 seconds
    //   },
    // },
});

worker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed successfully.`);
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} has failed with error: ${err.message}`);
    // Additional logging or notification can be done here
});

console.log(`Audit worker started. Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}. Waiting for jobs...`);
