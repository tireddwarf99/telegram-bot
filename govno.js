const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const Telegram = require('node-telegram-bot-api');
const getImagesSource = require('./controllers/mediaScrapper');
const getImage = require("./controllers/mediaScrapper");
require('dotenv').config({path: "./.env"});

const token = process.env.TEST_BOT_TOKEN;

const bot = new Telegram(token, { polling: true } );

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Здарова уёбак");
})

bot.on('message', async (msg) => {
    try {
        bot.sendMessage(msg.chat.id, "Давай посмотрим, чё ты насрал");
        delay(500);
        const post = getImagesSource(msg.text);
        console.log("Parsing url");
        getImage(post);

    } catch {

    }
})

async function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }