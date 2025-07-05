require('dotenv').config({ path: './config/.env' });
const axios = require('axios');

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!GOOGLE_PLACES_API_KEY) {
    console.error("FATAL ERROR: GOOGLE_PLACES_API_KEY environment variable is not set.");
    process.exit(1); // Exit if key is missing
}

async function getLatLng(location) {
    console.log(`Fetching lat/lng for location: "${location}"`);
    if (!GOOGLE_PLACES_API_KEY) { // Redundant check, but good for specific function context if called elsewhere
        const errMsg = "Google Places API key is missing. Cannot fetch geocoding data.";
        console.error(errMsg);
        throw new Error(errMsg);
    }
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: location,
                key: GOOGLE_PLACES_API_KEY
            }
        });

        console.log(`Geocode API response status for "${location}": ${response.status}`);
        // console.log(`Geocode API response data for "${location}":`, JSON.stringify(response.data, null, 2));


        if (!response.data.results || response.data.results.length === 0) {
            console.error(`No geocoding results found for location: "${location}". Full response:`, response.data);
            throw new Error(`No results found for location: ${location}`);
        }
        const { lat, lng } = response.data.results[0].geometry.location;
        console.log(`Successfully fetched lat/lng for "${location}": { lat: ${lat}, lng: ${lng} }`);
        return { lat, lng };
    } catch (error) {
        console.error(`Error getting lat/lng for "${location}": ${error.message}`);
        if (error.response) {
            console.error("Geocode API Error Response Data:", error.response.data);
        }
        throw error;
    }
}

async function nearbySearch(keyword, lat, lng, radius) {
    console.log(`Performing nearby search for keyword: "${keyword}", lat: ${lat}, lng: ${lng}, radius: ${radius}m`);
    if (!GOOGLE_PLACES_API_KEY) { // Redundant check
        const errMsg = "Google Places API key is missing. Cannot perform nearby search.";
        console.error(errMsg);
        throw new Error(errMsg);
    }
    try {
        const requestBody = {
            includedTypes: [keyword], // Assuming keyword is a valid type
            locationRestriction: {
                circle: {
                    center: {
                        latitude: lat,
                        longitude: lng,
                    },
                    radius: radius,
                },
            },
            maxResultCount: 10 // Limiting results for now, can be adjusted
        };

        console.log("Nearby search request body:", JSON.stringify(requestBody, null, 2));

        const response = await axios.post('https://places.googleapis.com/v1/places:searchNearby', requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount', // Added more fields for context
            },
            timeout: 30000 // 30 second timeout
        });

        console.log(`Nearby Search API response status for "${keyword}": ${response.status}`);
        // console.log(`Nearby Search API response data for "${keyword}":`, JSON.stringify(response.data, null, 2));

        const places = response.data.places || [];
        console.log(`Found ${places.length} places for keyword "${keyword}" near lat: ${lat}, lng: ${lng}.`);
        return places;
    } catch (error) {
        console.error(`Error in nearby search for "${keyword}": ${error.message}`);
        if (error.response) {
            console.error("Nearby Search API Error Response Status:", error.response.status);
            console.error("Nearby Search API Error Response Data:", error.response.data);
        }
        throw error;
    }
}

// getPlaceDetails is not currently used by server.js, but we'll keep the API key check here for completeness
async function getPlaceDetails(placeId) {
    console.log(`Fetching details for placeId: "${placeId}"`);
    if (!GOOGLE_PLACES_API_KEY) {
        const errMsg = "Google Places API key is missing. Cannot fetch place details.";
        console.error(errMsg);
        throw new Error(errMsg);
    }
    try {
        const response = await axios.get(`https://places.googleapis.com/v1/places/${placeId}`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
                'X-Goog-FieldMask': 'id,displayName,websiteUri,formattedAddress,nationalPhoneNumber', // Added more fields
            },
            timeout: 15000 // 15 second timeout
        });
        console.log(`Get Place Details API response status for "${placeId}": ${response.status}`);
        // console.log(`Get Place Details API response data for "${placeId}":`, JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error) {
        console.error(`Error getting place details for placeId "${placeId}": ${error.message}`);
        if (error.response) {
            console.error("Get Place Details API Error Response Data:", error.response.data);
        }
        throw error;
    }
}

module.exports = { nearbySearch, getLatLng, getPlaceDetails };
