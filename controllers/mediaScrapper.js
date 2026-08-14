const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: "./.env"});

// Парсинг фото на сайте
async function getImagesSource(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const images = [];
        $('img').each((_, element) => {
            const src = $(element).attr('src');
            if (src) {
                images.push(src.startsWith('http') ? src : new URL(src, url).href);
            }
        });
        return { images };
    } catch {

    }
    
}

// Парсинг видео на сайте
async function getVideosSource(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const videos = [];
        $('source').each((_, element) => {
            const src = $(element).attr('src');
            if (src) {
                videos.push(src.startsWith('http') ? src : new URL(src, url).href);
            }
        });
        return { videos };
    } catch {

    }
}

// Загрузка фотографий с сайта
async function getImages(mediaUrls, saveFolder) {
    if (!fs.existsSync(saveFolder)) {
        fs.mkdirSync(saveFolder, { recursive: true });
    }

    for (const [index, url] of mediaUrls.images.entries()) {
        try {
            const filePath = path.join(saveFolder, `image_${index + 1}${path.extname(url) || '.jpg'}`);
            await downloadFile(url, filePath);
            console.log(`Изображение сохранено: ${filePath}`);
        } catch (error) {
            console.error(`Ошибка при сохранении изображения ${url}:`, error.message);
        }
    }   
}

// Загрузка видео с сайта
async function getVideos(mediaUrls, saveFolder) {
    if (!fs.existsSync(saveFolder)) {
        fs.mkdirSync(saveFolder, { recursive: true });
    }

    for (const [index, url] of mediaUrls.videos.entries()) {
        try {
            const filePath = path.join(saveFolder, `video_${index + 1}${path.extname(url) || '.mp4'}`);
            await downloadFile(url, filePath);
            console.log(`Видео сохранено: ${filePath}`);
        } catch (error) {
            console.error(`Ошибка при сохранении видео ${url}:`, error.message);
        }
    } 
}


async function downloadFile(url, filePath) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

exports.getImagesSource = getImagesSource;
exports.getImages = getImages;