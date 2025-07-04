require('dotenv').config({ path: './config/.env' });
const axios = require('axios');

async function searchPlaces(query) {
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
            params: {
                query: query,
                key: process.env.GOOGLE_PLACES_API_KEY
            }
        });

        return response.data.results;
    } catch (error) {
        console.error('Error searching places:', error);
        throw error;
    }
}

module.exports = { searchPlaces };
