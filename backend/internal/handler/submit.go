package handler

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/tarunbtw/formsy/internal/db"
	"github.com/tarunbtw/formsy/internal/schema"
	"github.com/tarunbtw/formsy/internal/mailer"
	gonanoid "github.com/matoous/go-nanoid/v2"
)

func Submit(c *fiber.Ctx) error {
	projectID := c.Params("project_id")

	var rawSchema []byte
	var projectName, ownerEmail string

	err := db.Pool.QueryRow(context.Background(),
		`SELECT p.schema, p.name, u.email 
		 FROM projects p 
		 JOIN users u ON u.id = p.owner_id 
		 WHERE p.id = $1`,
		projectID,
	).Scan(&rawSchema, &projectName, &ownerEmail)

	if err == pgx.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "project not found"})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db error"})
	}

	body := map[string]any{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid json"})
	}

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

	// fire email in background, don't block the response
	go mailer.SendSubmissionAlert(ownerEmail, projectName, projectID, body)

	return c.Status(201).JSON(fiber.Map{"ok": true, "id": id})
}