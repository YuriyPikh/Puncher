const { MongoClient } = require('mongodb');

const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DEFAULT_DB_NAME = process.env.MONGODB_DB_NAME || 'WebTimeTrackerDB';

let client;
let db;
let connectPromise;

async function connectToDatabase() {
  if (db) {
    return db;
  }

  if (!connectPromise) {
    client = new MongoClient(DEFAULT_URI);
    connectPromise = client.connect().then((connectedClient) => {
      db = connectedClient.db(DEFAULT_DB_NAME);
      return db;
    });
  }

  return connectPromise;
}

function getDb() {
  if (!db) {
    throw new Error('Database connection has not been initialized');
  }

  return db;
}

function getCollections() {
  const database = getDb();
  return {
    companies: database.collection('companies'),
    users: database.collection('users'),
    timeLogs: database.collection('time_logs'),
    timeCorrections: database.collection('time_corrections')
  };
}

async function closeDatabase() {
  if (client) {
    await client.close();
  }

  client = null;
  db = null;
  connectPromise = null;
}

module.exports = {
  connectToDatabase,
  closeDatabase,
  getCollections
};
