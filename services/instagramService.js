const axios = require('axios');

const instaScrapper = async (url) => {
  const options = {
    method: 'GET',
    url: 'https://instagram-looter2.p.rapidapi.com/post-dl',
    params: { link: url },
    timeout: 20000,
    headers: {
      'X-RapidAPI-Key': process.env.RAPID_API_KEY,
      'X-RapidAPI-Host': process.env.RAPID_API_HOST
    }
  };

  try {
    const response = await axios.request(options);
    return response.data.data.medias;
  } catch (error) {
    console.error('Ошибканчик, разраб апи насрал в штаны!:', { code: error.code, status: error.response?.status });
    throw error;
  }
};

module.exports = { instaScrapper };
