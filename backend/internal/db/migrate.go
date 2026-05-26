package db

import "context"

func Migrate() error {
	_, err := Pool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS projects (
			id          TEXT PRIMARY KEY,
			name        TEXT NOT NULL,
			owner_id    TEXT NOT NULL,
			schema      JSONB NOT NULL DEFAULT '[]',
			created_at  TIMESTAMPTZ DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS submissions (
			id          TEXT PRIMARY KEY,
			project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			data        JSONB NOT NULL,
			ip          TEXT,
			created_at  TIMESTAMPTZ DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_submissions_project_id ON submissions(project_id);
	`)
	return err
}