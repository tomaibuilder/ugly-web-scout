const express = require('express');
const db = require('./src/db');
const { Parser } = require('json2csv');
const { nearbySearch, getLatLng } = require('./src/workers/googlePlaces');
const auditQueue = require('./src/queues');
const enrichmentQueue = require('./src/queues/enrichmentQueue');
const app = express();
const port = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Check for critical environment variables at startup
if (!process.env.DATABASE_URL) {
    console.warn("Warning: DATABASE_URL environment variable is not set. Database operations might fail.");
}
if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
    console.warn("Warning: REDIS_HOST or REDIS_PORT environment variables are not set. Queue operations might fail.");
}
// Specific API key checks are done in their respective worker modules.

// Routes
app.get('/audits', async (req, res) => {
    const { quadrant } = req.query;
    let query = 'SELECT * FROM audits';
    const params = [];
    if (quadrant) {
        query += ' WHERE quadrant = $1';
        params.push(quadrant);
    }
    try {
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching audits:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/credits', async (req, res) => {
    try {
        // In a real app, user ID would come from session or token
        const { rows } = await db.query('SELECT credits FROM users WHERE id = 1');
        if (rows.length === 0) {
            return res.status(404).send('User not found');
        }
        res.json({ credits: rows[0].credits });
    } catch (error) {
        console.error('Error fetching credits:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/export', async (req, res) => {
    const { quadrant } = req.query;
    let query = 'SELECT * FROM audits';
    const params = [];
    if (quadrant) {
        query += ' WHERE quadrant = $1';
        params.push(quadrant);
    }
    try {
        const { rows } = await db.query(query, params);
        if (rows.length === 0) {
            return res.status(404).send('No audits found to export for the given criteria.');
        }
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(rows);
        res.header('Content-Type', 'text/csv');
        res.attachment('audits.csv');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting audits:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/enrich', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).send('Invalid request: urls must be a non-empty array.');
    }

    try {
        await enrichmentQueue.add('enrich-leads', { urls }); // Batching to be addressed in step 4
        res.status(200).send('Enrichment process started for ' + urls.length + ' URLs.');
    } catch (error) {
        console.error('Error starting enrichment process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/preview-search', async (req, res) => {
    const { industry, location, radius } = req.query;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request: industry, location, and radius are required.');
    }
    const searchRadius = parseFloat(radius);
    if (isNaN(searchRadius) || searchRadius <= 0) {
        return res.status(400).send('Invalid request: radius must be a positive number.');
    }

    try {
        console.log(`Preview search requested for industry: "${industry}", location: "${location}", radius: ${searchRadius} miles`);
        const { lat, lng } = await getLatLng(location);
        const radiusInMeters = Math.min(searchRadius * 1609.34, 50000); // Convert miles to meters, cap at 50km

        console.log(`Calling nearbySearch with industry: "${industry}", lat: ${lat}, lng: ${lng}, radius: ${radiusInMeters}m`);
        const places = await nearbySearch(industry, lat, lng, radiusInMeters);

        console.log(`nearbySearch returned ${places.length} places for preview.`);
        const placesWithWebsites = places.filter(p => p && p.websiteUri);
        console.log(`${placesWithWebsites.length} places have a websiteUri.`);

        const websiteUrisPreview = placesWithWebsites.slice(0, 5).map(p => p.websiteUri);
        if (placesWithWebsites.length > 0) {
            console.log("Sample websiteUris for preview:", websiteUrisPreview);
        }

        res.json({
            count: placesWithWebsites.length,
            total: places.length,
            placesPreview: websiteUrisPreview
        });
    } catch (error) {
        console.error(`Error in /preview-search for industry: "${industry}", location: "${location}": ${error.message}`);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location, radius } = req.body;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request: industry, location, and radius are required.');
    }
    const searchRadius = parseFloat(radius);
    if (isNaN(searchRadius) || searchRadius <= 0) {
        return res.status(400).send('Invalid request: radius must be a positive number.');
    }

    try {
        console.log(`Audit start requested for industry: "${industry}", location: "${location}", radius: ${searchRadius} miles`);
        const { lat, lng } = await getLatLng(location);
        const radiusInMeters = Math.min(searchRadius * 1609.34, 50000); // Convert miles to meters, cap at 50km

        console.log(`Calling nearbySearch with industry: "${industry}", lat: ${lat}, lng: ${lng}, radius: ${radiusInMeters}m`);
        const places = await nearbySearch(industry, lat, lng, radiusInMeters);

        console.log(`nearbySearch returned ${places.length} places for audit.`);
        const placesWithWebsites = places.filter(p => p && p.websiteUri);
        console.log(`${placesWithWebsites.length} places have a websiteUri to be queued.`);

        let addedToQueueCount = 0;
        for (const place of placesWithWebsites) { // Iterate only over places with websites
            // Sanity check, though filter should handle it
            if (place && place.websiteUri) {
                await auditQueue.add('audit-queue', { url: place.websiteUri });
                addedToQueueCount++;
            }
        }

        console.log(`Added ${addedToQueueCount} URLs to audit queue for industry: "${industry}", location: "${location}", radius: ${radius} miles.`);
        if (addedToQueueCount > 0) {
            console.log("First few URLs added to queue:", placesWithWebsites.slice(0, Math.min(5, addedToQueueCount)).map(p => p.websiteUri));
        }

        res.status(200).send(`Audit process initiated. ${addedToQueueCount} URLs from ${places.length} places found have been added to the queue.`);
    } catch (error) {
        console.error(`Error in /start-audit for industry: "${industry}", location: "${location}": ${error.message}`);
        res.status(500).send('Internal Server Error');
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
