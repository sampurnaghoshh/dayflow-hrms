-- 002_users_and_employees.sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code   TEXT UNIQUE NOT NULL,
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'EMPLOYEE',
  status          user_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
  email_verified_at TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,              -- sha256 of the raw token; raw is never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON email_verification_tokens (token_hash) WHERE consumed_at IS NULL;

CREATE TABLE departments (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE employees (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  department_id     BIGINT REFERENCES departments(id),
  manager_id        BIGINT REFERENCES employees(id),
  designation       TEXT,
  date_of_joining   DATE NOT NULL,
  phone             TEXT,
  address           TEXT,
  profile_photo_path TEXT,
  CONSTRAINT no_self_manage CHECK (manager_id IS DISTINCT FROM id)
);
CREATE INDEX ON employees (department_id);
CREATE INDEX ON employees (manager_id);

CREATE TABLE employee_documents (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id   BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL,            -- ID_PROOF, OFFER_LETTER, CERTIFICATE, OTHER
  original_name TEXT NOT NULL,
  stored_path   TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  uploaded_by   BIGINT NOT NULL REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON employee_documents (employee_id);
