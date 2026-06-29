import { createApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const server = createApp({ config });

server.listen(config.port, config.host, () => {
  console.info(`TimeGrapher Gemini backend listening on http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.info(`Received ${signal}; shutting down.`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
