var pg = require('pg')
require('dotenv').config()

var config = {
  user: process.env.DATABASE_USER,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  max: process.env.DATABASE_MAX,
  idleTimeoutMillis: process.env.DATABASE_TIMEOUT_MILLIS,
}

var pool = new pg.Pool(config)

module.exports = { pool }
