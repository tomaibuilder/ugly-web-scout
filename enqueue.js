const { searchPlaces } = require('./src/workers/googlePlaces');

const query = process.argv[2];

if (!query) {
    console.error('Please provide a search query.');
    process.exit(1);
}

searchPlaces(query);
