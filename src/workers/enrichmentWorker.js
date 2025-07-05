require('dotenv').config({ path: './config/.env' });
const { Worker } = require('bullmq');
const { enrichLeads } = require('./dropContact');
const db = require('../db');

const worker = new Worker('enrichment-queue', async (job) => {
    const { urls } = job.data;
    console.log('Processing enrichment job:', job.id, urls);

    try {
        const leads = urls.map(url => ({ website: url }));
        const enrichedData = await enrichLeads(leads);

        if (!enrichedData) {
            throw new Error('No data returned from DropContact');
        }

        for (const data of enrichedData) {
            // Assuming the DropContact API returns an object with a 'website' and 'email' property
            const url = data.website;
            const email = data.email;
            // The rest of the data is the enriched data
            delete data.website;
            delete data.email;
            await db.query(
                'UPDATE audits SET enriched_data = $1, email = $2 WHERE url = $3',
                [JSON.stringify(data), email, url]
            );
        }

        console.log(`Enrichment for job ${job.id} completed.`);

    } catch (error) {
        console.error(`Error processing enrichment job ${job.id}:`, error.message);
        throw error; // This will cause the job to be retried
    }

}, {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
    },
});

console.log('Enrichment worker started');
