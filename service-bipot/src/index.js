const express = require('express');
const helmet = require('helmet');
const { getPool, assertConfigured } = require('./db/pools');
const ApiResponse = require('./utils/ApiResponse');
const bipotService = require('./services/bipot.service');

const REQUIRED_DATABASES = ['SIMAKU', 'SIADE'];
assertConfigured(REQUIRED_DATABASES);

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

app.get('/health', async (req, res) => {
  const databases = {};
  await Promise.all(
    REQUIRED_DATABASES.map(async (name) => {
      try {
        await getPool(name).query('SELECT 1');
        databases[name] = 'up';
      } catch (err) {
        databases[name] = 'down';
      }
    })
  );

  const allUp = Object.values(databases).every((status) => status === 'up');
  res
    .status(allUp ? 200 : 503)
    .json({ success: allUp, message: allUp ? 'ok' : 'degraded', data: { databases } });
});

app.get('/scopes', (req, res) => {
  res.json({
    service: 'service-bipot',
    routes: [
      {
        method: 'GET',
        path: '/bipot/list',
        scope: 'bipot:list',
        description: 'List biaya dan potongan',
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

app.get('/bipot/list', async (req, res, next) => {
  try {
    const bipot = await bipotService.getAllBipot();
    ApiResponse.success(res, { data: bipot, message: 'Berhasil mengambil data biaya dan potongan.' });
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
  console.log(`service-bipot listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
