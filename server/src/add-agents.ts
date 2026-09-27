import bcrypt from 'bcrypt'
import { randomBytes } from 'node:crypto'
import { pool } from './db.js'

function generatePassword(): string {
  return randomBytes(9).toString('base64url')
}

async function insertAgent(email: string, name: string, password: string) {
  const hash = await bcrypt.hash(password, 12)
  await pool.query(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, 'agent', $3)
     ON CONFLICT (email) DO NOTHING`,
    [email, hash, name],
  )
}

async function run() {
  const callumPassword = generatePassword()
  const priyaPassword = generatePassword()

  await insertAgent('callum.agent@smartbot.local', 'Callum R. (Agent)', callumPassword)
  await insertAgent('priya.agent@smartbot.local', 'Priya S. (Agent)', priyaPassword)

  console.log('Added agent accounts (save these now, they will not be shown again):')
  console.log('')
  console.log(`  Agent  email: callum.agent@smartbot.local   password: ${callumPassword}`)
  console.log(`  Agent  email: priya.agent@smartbot.local    password: ${priyaPassword}`)
  console.log('')

  await pool.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
