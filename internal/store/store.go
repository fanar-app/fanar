package store

import (
	"database/sql"
	"encoding/json"
	"log"
	"strconv"
	"time"

	_ "modernc.org/sqlite"
)

type Origin struct {
	File     string `json:"file"`
	Line     int    `json:"line"`
	Function string `json:"function"`
}

type Payload struct {
	ID        string    `json:"id"`
	RequestID string    `json:"requestId,omitempty"`
	Type      string    `json:"type"`
	Label     string    `json:"label"`
	Color     string    `json:"color,omitempty"`
	Content   string    `json:"content"`
	Origin    Origin    `json:"origin,omitempty"`
	Project   *string   `json:"project,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

type Store struct {
	db *sql.DB
}

func New(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	return s, s.migrate()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`CREATE TABLE IF NOT EXISTS payloads (
		id         TEXT PRIMARY KEY,
		request_id TEXT NOT NULL DEFAULT '',
		type       TEXT NOT NULL,
		label      TEXT NOT NULL DEFAULT '',
		color      TEXT NOT NULL DEFAULT '',
		content    TEXT NOT NULL DEFAULT '{}',
		origin     TEXT NOT NULL DEFAULT '{}',
		project    TEXT,
		timestamp  DATETIME NOT NULL
	)`)
	if err != nil {
		return err
	}
	if _, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_request_id ON payloads(request_id)`); err != nil {
		return err
	}
	_, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_timestamp ON payloads(timestamp)`)
	return err
}

const DefaultPort = 23517

func (s *Store) GetPort() int {
	var v string
	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'port'`).Scan(&v); err != nil {
		return DefaultPort
	}
	p, err := strconv.Atoi(v)
	if err != nil || p < 1 || p > 65535 {
		return DefaultPort
	}
	return p
}

func (s *Store) SetPort(port int) error {
	_, err := s.db.Exec(
		`INSERT INTO settings (key, value) VALUES ('port', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		strconv.Itoa(port),
	)
	return err
}

const maxPayloads = 1000

func (s *Store) Insert(p Payload) error {
	origin, err := json.Marshal(p.Origin)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err = tx.Exec(
		`INSERT INTO payloads (id, request_id, type, label, color, content, origin, project, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.RequestID, p.Type, p.Label, p.Color, p.Content, string(origin), p.Project, p.Timestamp,
	); err != nil {
		return err
	}
	if _, err = tx.Exec(
		`DELETE FROM payloads WHERE id NOT IN (
			SELECT id FROM payloads ORDER BY timestamp DESC LIMIT ?
		)`, maxPayloads,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) List() ([]Payload, error) {
	rows, err := s.db.Query(`
		SELECT id, request_id, type, label, color, content, origin, project, timestamp
		FROM payloads ORDER BY timestamp ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payloads []Payload
	for rows.Next() {
		var p Payload
		var originJSON string
		if err := rows.Scan(&p.ID, &p.RequestID, &p.Type, &p.Label, &p.Color, &p.Content, &originJSON, &p.Project, &p.Timestamp); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(originJSON), &p.Origin); err != nil {
			log.Printf("[fanar] corrupt origin JSON for payload %s: %v", p.ID, err)
		}
		payloads = append(payloads, p)
	}
	if payloads == nil {
		payloads = []Payload{}
	}
	return payloads, rows.Err()
}

func (s *Store) Clear() error {
	_, err := s.db.Exec(`DELETE FROM payloads`)
	return err
}

func (s *Store) Close() error {
	return s.db.Close()
}
