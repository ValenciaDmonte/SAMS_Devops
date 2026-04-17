const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

let poolConfig;
if (connectionString) {
  poolConfig = {
    connectionString,
    ssl: { rejectUnauthorized: false }
  };
} else {
  poolConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
  };
}

const pool = new Pool(poolConfig);

const JWT_SECRET = process.env.JWT_SECRET;

pool.query('SELECT NOW()', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log(' Database connected successfully');
});

module.exports = { pool, JWT_SECRET };
