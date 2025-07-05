require('dotenv').config({ path: './config/.env' });
const axios = require('axios');

async function getLatLng(location) {
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: location,
                key: process.env.GOOGLE_PLACES_API_KEY
            }
        });
        if (!response.data.results || response.data.results.length === 0) {
            console.error('Full geocode response:', response.data);
            throw new Error(`No results found for location: ${location}`);
        }
        return response.data.results[0].geometry.location;
    } catch (error) {
        console.error('Error getting lat/lng for', JSON.stringify(location), ':', error.message);
        throw error;
    }
}

async function nearbySearch(keyword, lat, lng, radius) {
    try {
        const response = await axios.post('https://places.googleapis.com/v1/places:searchNearby', {
            includedTypes: [keyword],
            locationRestriction: {
                circle: {
                    center: {
                        latitude: lat,
                        longitude: lng,
                    },
                    radius: radius,
                },
            },
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
                'X-Goog-FieldMask': 'places.id,places.websiteUri',
            },
        });
        return response.data.places || [];
    } catch (error) {
        console.error('Error in nearby search:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function getPlaceDetails(placeId) {
    try {
        const response = await axios.get(`https://places.googleapis.com/v1/places/${placeId}`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
                'X-Goog-FieldMask': 'websiteUri',
            },
        });
        return response.data;
    } catch (error) {
        console.error(`Error getting place details for placeId ${placeId}:`, error.message);
        throw error;
    }
}


module.exports = { nearbySearch, getLatLng, getPlaceDetails };
