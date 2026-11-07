import http from 'node:http';

export const SERVICE_NAME = 'auth-service';
const PORT = Number(process.env.PORT ?? 5001);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: SERVICE_NAME, status: 'UP' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[${SERVICE_NAME}] Listening on port ${PORT}`);
});
