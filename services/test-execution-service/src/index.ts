import http from 'node:http';

export const SERVICE_NAME = 'test-execution-service';
const PORT = Number(process.env.PORT ?? 5003);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      service: SERVICE_NAME,
      status: 'UP',
      url: req.url,
      userContext: {
        userId: req.headers['x-user-id'] ?? null,
        userRole: req.headers['x-user-role'] ?? null,
      },
    }),
  );
});

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[${SERVICE_NAME}] Listening on port ${PORT}`);
});
