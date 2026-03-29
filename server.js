const http = require('http');
const app = require('./app');
const { connectToDatabase } = require('./db');

const port = process.env.PORT || 3000;

async function start() {
  await connectToDatabase();

  const server = http.createServer(app);
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server');
  console.error(error);
  process.exit(1);
});

