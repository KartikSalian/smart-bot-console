import 'dotenv/config'
import { Pool } from 'pg'

const isProd = process.env.NODE_ENV === 'production'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed Postgres (Render, etc.) requires SSL for external connections.
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
})
