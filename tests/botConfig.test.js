const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('main and test entry points use separate Telegram tokens', () => {
  for (const [file, expectedToken] of [['bot.js', 'main-token'], ['bot_test.js', 'test-token']]) {
    const source = fs.readFileSync(path.join(__dirname, '../config', file), 'utf8');
    const calls = [];
    const context = {
      module: { exports: {} },
      process: { env: { TELEGRAM_API: 'main-token', TELEGRAM_API_TEST: 'test-token' } },
      require: (name) => {
        if (name === 'dotenv') return { config: () => {} };
        assert.equal(name, 'node-telegram-bot-api');
        return function TelegramBot(token, options) { calls.push({ token, options }); };
      },
    };
    vm.runInNewContext(source, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].token, expectedToken);
    assert.equal(calls[0].options.polling, true);
  }
});
