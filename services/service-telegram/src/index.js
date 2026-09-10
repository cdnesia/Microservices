const express = require('express');
const helmet = require('helmet');
const { z } = require('zod');
const ApiResponse = require('./utils/ApiResponse');
const { parseOrThrow } = require('./utils/validate');
const telegramService = require('./services/telegram.service');

const inlineButtonSchema = z.object({ text: z.string().trim().min(1) }).passthrough();

const sendMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(4096),
    chat_id: z.string().trim().max(100).optional(),
    parse_mode: z.enum(['HTML', 'Markdown']).optional(),
    inline_keyboard: z.array(z.array(inlineButtonSchema)).optional(),
  })
  .strict();

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

// Tidak ada database — service ini murni proxy ke Telegram Bot API.
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'ok', data: null });
});

app.get('/scopes', (req, res) => {
  res.json({
    service: 'service-telegram',
    routes: [
      {
        method: 'POST',
        path: '/telegram/send-message',
        scope: 'telegram:send-message',
        description: 'Kirim pesan lewat Telegram bot',
      },
    ],
  });
});

app.use((req, res, next) => {
  if (!req.headers['x-client-id']) {
    return ApiResponse.error(res, {
      message: 'Request harus lewat API gateway',
      statusCode: 403,
    });
  }
  next();
});

app.post('/telegram/send-message', async (req, res, next) => {
  try {
    const data = parseOrThrow(sendMessageSchema, req.body);

    const replyMarkup = data.inline_keyboard ? { inline_keyboard: data.inline_keyboard } : undefined;

    const result = await telegramService.sendMessage({
      text: data.text,
      chatId: data.chat_id,
      parseMode: data.parse_mode || 'HTML',
      replyMarkup,
    });

    ApiResponse.success(res, {
      data: {
        message_id: result.result?.message_id ?? null,
        chat: result.result?.chat ?? null,
      },
      message: 'Pesan berhasil dikirim.',
    });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => ApiResponse.error(res, { message: 'Route tidak ditemukan.', statusCode: 404 }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Terjadi kesalahan pada server.';
  if (!err.isOperational) {
    console.error('Unhandled error:', err);
  }
  ApiResponse.error(res, { message, statusCode });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`service-telegram listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
