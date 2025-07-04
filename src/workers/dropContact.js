require('dotenv').config({ path: './config/.env' });
const axios = require('axios');

async function enrichLeads(leads) {
    try {
        const response = await axios.post('https://api.dropcontact.io/batch', {
            api_key: process.env.DROPCONTACT_API_KEY,
            data: leads,
        });

        return response.data;
    } catch (error) {
        console.error('Error enriching leads:', error);
    }
}

module.exports = { enrichLeads };
