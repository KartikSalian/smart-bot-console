import bcrypt from 'bcrypt'
import { randomBytes } from 'node:crypto'
import { pool } from './db.js'

function generatePassword(): string {
  return randomBytes(9).toString('base64url')
}

async function upsertUser(email: string, name: string, role: 'agent' | 'supervisor', password: string) {
  const hash = await bcrypt.hash(password, 12)
  await pool.query(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, name = EXCLUDED.name`,
    [email, hash, role, name],
  )
}

async function seed() {
  const supervisorPassword = generatePassword()
  const agentPassword = generatePassword()

  await upsertUser('supervisor@smartbot.local', 'Declan (Supervisor)', 'supervisor', supervisorPassword)
  await upsertUser('agent@smartbot.local', 'Niamh (Agent)', 'agent', agentPassword)

  console.log('Seeded accounts (save these now, they will not be shown again):')
  console.log('')
  console.log(`  Supervisor  email: supervisor@smartbot.local   password: ${supervisorPassword}`)
  console.log(`  Agent       email: agent@smartbot.local        password: ${agentPassword}`)
  console.log('')

  await pool.end()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
