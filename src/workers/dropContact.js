require('dotenv').config({ path: './config/.env' });
const axios = require('axios');

const DROPCONTACT_API_KEY = process.env.DROPCONTACT_API_KEY;

if (!DROPCONTACT_API_KEY) {
    console.error("FATAL ERROR: DROPCONTACT_API_KEY environment variable is not set.");
    process.exit(1); // Exit if key is missing
}

/**
 * Enriches a batch of leads using the DropContact API.
 * @param {Array<Object>} batchOfLeads - An array of lead objects to enrich.
 *                                      Example: [{ "website": "example.com" }]
 * @returns {Promise<Array<Object>>} A promise that resolves to the enriched data from DropContact.
 * @throws {Error} If the API request fails or returns an error.
 */
async function enrichLeadBatch(batchOfLeads) {
    if (!batchOfLeads || batchOfLeads.length === 0) {
        console.log("enrichLeadBatch called with empty or invalid batch. Skipping.");
        return [];
    }
    console.log(`Sending batch of ${batchOfLeads.length} leads to DropContact.`);
    // console.debug("Batch details:", JSON.stringify(batchOfLeads, null, 2)); // For verbose debugging

    try {
        const response = await axios.post('https://api.dropcontact.io/batch', {
            api_key: DROPCONTACT_API_KEY,
            data: batchOfLeads,
            // Add any other parameters required by DropContact, e.g., for siren_enrichment if needed
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 90000 // 90 seconds timeout, as batch processing can take time
        });

        console.log(`DropContact API response status for batch: ${response.status}`);
        // console.debug("Raw DropContact response data for batch:", JSON.stringify(response.data, null, 2));

        // DropContact might return 200 OK with errors in the body or a request_id for polling
        // This example assumes direct results. Adjust if polling is needed.
        // Typically, response.data would be an array of results or an object containing them.
        if (response.data && response.data.error) {
            console.error("DropContact API returned an error:", response.data.error);
            throw new Error(`DropContact API error: ${response.data.error}`);
        }

        // It's good practice to check if the response is what you expect, e.g., an array
        if (!Array.isArray(response.data)) {
            // This handles cases where the API might return a single object for a single lead,
            // or an object wrapper like { "results": [...] }. Adapt as per actual API behavior.
            // For now, we assume it directly returns an array of enriched lead objects.
            console.warn("DropContact response was not an array. Data:", response.data);
            // Depending on API, you might want to throw new Error or try to find data within response.data
        }

        return response.data || []; // Ensure it always returns an array
    } catch (error) {
        console.error('Error calling DropContact API for batch:', error.message);
        if (error.response) {
            console.error("DropContact API Error Response Status:", error.response.status);
            console.error("DropContact API Error Response Data:", JSON.stringify(error.response.data, null, 2));
            throw new Error(`DropContact API request failed with status ${error.response.status}: ${error.response.data?.error || error.message}`);
        }
        throw error; // Rethrow original error if not an axios error with a response
    }
}

module.exports = { enrichLeadBatch };
