-- Database initialization script for Vercel Postgres
-- Run this once after creating your Vercel Postgres database

CREATE TABLE IF NOT EXISTS users (
  phone_number VARCHAR(20) PRIMARY KEY,
  google_calendar_tokens JSONB,
  calendar_linked BOOLEAN DEFAULT FALSE,
  calendar_linked_at TIMESTAMP,
  pending_oauth VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_calendar_linked ON users(calendar_linked);

