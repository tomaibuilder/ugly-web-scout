const express = require('express');
const db = require('./src/db');
const { Parser } = require('json2csv');
const { nearbySearch, getLatLng, getPlaceDetails } = require('./src/workers/googlePlaces');
const auditQueue = require('./src/queues');
const enrichmentQueue = require('./src/queues/enrichmentQueue');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

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
        return res.status(400).send('Invalid request');
    }

    try {
        await enrichmentQueue.add('enrich-leads', { urls });
        res.status(200).send('Enrichment process started.');
    } catch (error) {
        console.error('Error starting enrichment process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/preview-search', async (req, res) => {
    const { industry, location, radius } = req.query;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, Math.min(radius * 1609.34, 50000)); // Convert miles to meters and cap at 50km
        res.json({ count: places.filter(p => p.websiteUri).length, total: places.length });
    } catch (error) {
        console.error('Error previewing search:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location, radius } = req.body;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, Math.min(radius * 1609.34, 50000)); // Convert miles to meters and cap at 50km
        for (const place of places) {
            if (place.websiteUri) {
                await auditQueue.add('audit-queue', { url: place.websiteUri });
            }
        }
        res.status(200).send('Audit process started.');
    } catch (error) {
        console.error('Error starting audit process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location, radius } = req.body;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, radius * 1609.34); // Convert miles to meters
        for (const place of places) {
            if (place.websiteUri) {
                await auditQueue.add('audit-queue', { url: place.websiteUri });
            }
        }
        res.status(200).send('Audit process started.');
    } catch (error) {
        console.error('Error starting audit process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});


// ... (rest of the routes remain the same)
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
        return res.status(400).send('Invalid request');
    }

    try {
        await enrichmentQueue.add('enrich-leads', { urls });
        res.status(200).send('Enrichment process started.');
    } catch (error) {
        console.error('Error starting enrichment process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/preview-search', async (req, res) => {
    const { industry, location, radius } = req.query;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, radius * 1609.34); // Convert miles to meters
        res.json({ count: places.filter(p => p.website).length, total: places.length });
    } catch (error) {
        console.error('Error previewing search:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location, radius } = req.body;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, radius * 1609.34); // Convert miles to meters
        for (const place of places) {
            if (place.website) {
                await auditQueue.add('audit-queue', { url: place.website });
            }
        }
        res.status(200).send('Audit process started.');
    } catch (error) {
        console.error('Error starting audit process:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});


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
        return res.status(400).send('Invalid request');
    }

    try {
        await enrichmentQueue.add('enrich-leads', { urls });
        res.status(200).send('Enrichment process started.');
    } catch (error) {
        console.error('Error starting enrichment process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/preview-search', async (req, res) => {
    const { industry, location, radius } = req.query;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, radius * 1609.34); // Convert miles to meters
        res.json({ count: places.filter(p => p.website).length, total: places.length });
    } catch (error) {
        console.error('Error previewing search:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location, radius } = req.body;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, radius * 1609.34); // Convert miles to meters
        for (const place of places) {
            if (place.website) {
                await auditQueue.add('audit-queue', { url: place.website });
            }
        }
        res.status(200).send('Audit process started.');
    } catch (error) {
        console.error('Error starting audit process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

app.use(express.static('public'));
app.use(express.json());

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
        return res.status(400).send('Invalid request');
    }

    try {
        await enrichmentQueue.add('enrich-leads', { urls });
        res.status(200).send('Enrichment process started.');
    } catch (error) {
        console.error('Error starting enrichment process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/preview-search', async (req, res) => {
    const { industry, location, radius } = req.query;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, radius * 1609.34); // Convert miles to meters
        res.json({ count: places.filter(p => p.website).length, total: places.length });
    } catch (error) {
        console.error('Error previewing search:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location, radius } = req.body;
    if (!industry || !location || !radius) {
        return res.status(400).send('Invalid request');
    }
    try {
        const { lat, lng } = await getLatLng(location);
        const places = await nearbySearch(industry, lat, lng, radius * 1609.34); // Convert miles to meters
        for (const place of places) {
            if (place.website) {
                await auditQueue.add('audit-queue', { url: place.website });
            }
        }
        res.status(200).send('Audit process started.');
    } catch (error) {
        console.error('Error starting audit process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});


app.get('/credits', async (req, res) => {
    try {
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
        return res.status(400).send('Invalid request');
    }

    try {
        await enrichmentQueue.add('enrich-leads', { urls });
        res.status(200).send('Enrichment process started.');
    } catch (error) {
        console.error('Error starting enrichment process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/preview-search', async (req, res) => {
    const { industry, location } = req.query;
    if (!industry || !location) {
        return res.status(400).send('Invalid request');
    }
    try {
        const places = await searchPlaces(`${industry} in ${location}`);
        res.json({ count: places.filter(p => p.website).length });
    } catch (error) {
        console.error('Error previewing search:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location } = req.body;
    if (!industry || !location) {
        return res.status(400).send('Invalid request');
    }
    try {
        const places = await searchPlaces(`${industry} in ${location}`);
        for (const place of places) {
            if (place.website) {
                await auditQueue.add('audit-queue', { url: place.website });
            }
        }
        res.status(200).send('Audit process started.');
    } catch (error) {
        console.error('Error starting audit process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});


app.get('/credits', async (req, res) => {
    try {
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
        return res.status(400).send('Invalid request');
    }

    // In a real application, you would add these to a queue for background processing
    try {
        const leads = urls.map(url => ({ website: url }));
        await enrichLeads(leads);
        res.status(200).send('Enrichment process started.');
    } catch (error) {
        console.error('Error starting enrichment process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/preview-search', async (req, res) => {
    const { industry, location } = req.query;
    if (!industry || !location) {
        return res.status(400).send('Invalid request');
    }
    try {
        const places = await searchPlaces(`${industry} in ${location}`);
        res.json({ count: places.filter(p => p.website).length });
    } catch (error) {
        console.error('Error previewing search:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/start-audit', async (req, res) => {
    const { industry, location } = req.body;
    if (!industry || !location) {
        return res.status(400).send('Invalid request');
    }
    try {
        const places = await searchPlaces(`${industry} in ${location}`);
        for (const place of places) {
            if (place.website) {
                await queue.add('audit-queue', { url: place.website });
            }
        }
        res.status(200).send('Audit process started.');
    } catch (error) {
        console.error('Error starting audit process:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
