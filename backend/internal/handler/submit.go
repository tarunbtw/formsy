package handler

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/tarunbtw/formsy/internal/db"
	"github.com/tarunbtw/formsy/internal/schema"

	gonanoid "github.com/matoous/go-nanoid/v2"
)

func Submit(c *fiber.Ctx) error {
	projectID := c.Params("project_id")

	// fetch project + schema
	var rawSchema []byte
	err := db.Pool.QueryRow(context.Background(),
		`SELECT schema FROM projects WHERE id = $1`, projectID,
	).Scan(&rawSchema)

	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "project not found"})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db error"})
	}

	// parse body
	body := map[string]any{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid json"})
	}

	// validate against schema
	if err := schema.Validate(rawSchema, body); err != nil {
		return c.Status(422).JSON(fiber.Map{"error": err.Error()})
	}

	id, _ := gonanoid.New()
	_, err = db.Pool.Exec(context.Background(),
		`INSERT INTO submissions (id, project_id, data, ip) VALUES ($1, $2, $3, $4)`,
		id, projectID, body, c.IP(),
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to save"})
	}

	return c.Status(201).JSON(fiber.Map{"ok": true, "id": id})
}