import http from 'node:http';

export const APP_NAME = 'gestor-testes-frontend';
const PORT = Number(process.env.PORT ?? 3000);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ app: APP_NAME, status: 'UP' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[${APP_NAME}] Listening on port ${PORT}`);
});
