const axios = require('axios');

const options = {
  method: 'GET',
  url: 'https://instagram-looter2.p.rapidapi.com/profile',
  params: {id: '18527'},
  headers: {
    'x-rapidapi-key': 'e50f67dbc5msha9b5b8a87f07cf4p169c81jsn9dbbdadab772',
    'x-rapidapi-host': 'instagram-looter2.p.rapidapi.com'
  }
};

try {
	const response = await axios.request(options);
	console.log(response.data);
} catch (error) {
	console.error(error);
}