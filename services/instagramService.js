const axios = require('axios');
require('dotenv').config();

const APIKey = process.env.RAPID_API_KEY;
const APIHost = process.env.RAPID_API_HOST;

const instaScrapper = async (url) => {
  const options = {
    method: 'GET',
    url: 'https://instagram-looter2.p.rapidapi.com/post-dl',
    params: { link: url },
    headers: {
      'X-RapidAPI-Key': APIKey,
      'X-RapidAPI-Host': APIHost
    }
  };

  try {
    const response = await axios.request(options);
    return response.data.data.medias;
  } catch (error) {
    console.error('Ошибканчик, разраб апи насрал в штаны!:', error);
    throw error;
  }
};

module.exports = { instaScrapper };