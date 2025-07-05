require('dotenv').config({ path: './config/.env' });
const { Worker } = require('bullmq');
const { enrichLeadBatch } = require('./dropContact'); // Updated import
const db = require('../db');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const DROPCONTACT_API_KEY = process.env.DROPCONTACT_API_KEY; // Check key here too for early feedback

if (!DROPCONTACT_API_KEY) {
    console.error("FATAL ERROR: DROPCONTACT_API_KEY environment variable is not set. Enrichment worker cannot start.");
    process.exit(1);
}

const BATCH_SIZE = 100; // As per AGENTS.md

const worker = new Worker('enrichment-queue', async (job) => {
    const { urls } = job.data;
    console.log(`Processing enrichment job: ${job.id} for ${urls.length} URLs.`);
    // console.debug(`URLs for job ${job.id}:`, urls);

    if (!urls || urls.length === 0) {
        console.log(`Job ${job.id} has no URLs to process. Marking as complete.`);
        return;
    }

    try {
        const leadsToEnrich = urls.map(url => ({ website: url })); // Prepare lead objects
        let allEnrichedData = [];

        console.log(`Job ${job.id}: Total leads to enrich: ${leadsToEnrich.length}. Batch size: ${BATCH_SIZE}`);

        for (let i = 0; i < leadsToEnrich.length; i += BATCH_SIZE) {
            const batch = leadsToEnrich.slice(i, i + BATCH_SIZE);
            console.log(`Job ${job.id}: Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(leadsToEnrich.length / BATCH_SIZE)}, size: ${batch.length}`);

            try {
                const batchResult = await enrichLeadBatch(batch);
                if (batchResult && batchResult.length > 0) {
                    console.log(`Job ${job.id}: Received ${batchResult.length} results from DropContact for batch.`);
                    // console.debug(`Job ${job.id}: Raw result for batch:`, JSON.stringify(batchResult, null, 2));
                    allEnrichedData.push(...batchResult);
                } else {
                    console.log(`Job ${job.id}: Batch returned no results or an empty array from DropContact.`);
                }
            } catch (batchError) {
                console.error(`Job ${job.id}: Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}. Error: ${batchError.message}. This batch will be skipped.`);
                // Depending on desired behavior, you might rethrow to fail the job or continue with other batches.
                // For now, we log and continue, meaning partial success is possible.
            }
        }

        console.log(`Job ${job.id}: Total enriched data items collected: ${allEnrichedData.length}`);

        if (allEnrichedData.length === 0) {
            console.log(`Job ${job.id}: No data was successfully enriched from DropContact. Nothing to update in DB.`);
            // Potentially mark job as failed or completed with warning if no data was expected.
            // For now, we'll let it complete, assuming some batches might fail but others succeed.
            return;
        }

        let updatedCount = 0;
        for (const enrichedLead of allEnrichedData) {
            // Assuming DropContact returns an object that includes the original 'website'
            // and other fields like 'email', 'company_name', 'first_name', 'last_name', etc.
            // The exact structure of `enrichedLead` depends on DropContact's response.
            // It's crucial to inspect `console.debug` of `batchResult` to map fields correctly.

            const originalUrl = enrichedLead.website; // Or however DropContact returns the input identifier
            const email = enrichedLead.email; // Example field

            if (!originalUrl) {
                console.warn(`Job ${job.id}: Enriched data item missing 'website' identifier. Skipping update. Data:`, enrichedLead);
                continue;
            }

            // Store all other properties from enrichedLead into enriched_data JSONB column
            // Avoid re-storing 'website' or 'email' if they have dedicated columns
            const dataToStore = { ...enrichedLead };
            delete dataToStore.website; // Already used as identifier
            delete dataToStore.email;   // Has its own column

            try {
                // Ensure the 'audits' table has 'enriched_data' (JSONB) and 'email' (TEXT) columns.
                // Also, ensure there's a 'last_enriched_at' (TIMESTAMP) column.
                const updateQuery = `
                    UPDATE audits
                    SET
                        enriched_data = $1,
                        email = $2,
                        last_enriched_at = NOW()
                    WHERE url = $3`;
                const { rowCount } = await db.query(updateQuery, [JSON.stringify(dataToStore), email, originalUrl]);
                if (rowCount > 0) {
                    updatedCount++;
                    console.log(`Job ${job.id}: Successfully updated audit for URL: ${originalUrl}`);
                } else {
                    console.warn(`Job ${job.id}: No audit found for URL: ${originalUrl} to update with enrichment data.`);
                }
            } catch (dbError) {
                console.error(`Job ${job.id}: DB Error updating audit for URL ${originalUrl}: ${dbError.message}. Data:`, enrichedLead);
                // Continue to next item, don't fail the whole job for one DB error
            }
        }

        console.log(`Enrichment for job ${job.id} completed. Updated ${updatedCount} records in the database out of ${allEnrichedData.length} enriched items received.`);

    } catch (error) {
        console.error(`Critical error processing enrichment job ${job.id}: ${error.message}`);
        // This error is for issues outside the batch loop, e.g., initial setup
        throw error; // This will cause the job to be retried by BullMQ
    }

}, {
    connection: {
        host: REDIS_HOST,
        port: REDIS_PORT,
    },
    // defaultJobOptions for enrichment queue if needed (e.g., lower concurrency)
});

worker.on('completed', (job, result) => {
    console.log(`Enrichment job ${job.id} has completed.`);
});

worker.on('failed', (job, err) => {
    console.error(`Enrichment job ${job.id} has failed with error: ${err.message}`);
});

console.log(`Enrichment worker started. Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}. Batch size: ${BATCH_SIZE}. Waiting for jobs...`);
