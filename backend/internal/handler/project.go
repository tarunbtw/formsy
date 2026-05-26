package handler

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/matoous/go-nanoid/v2"
	"github.com/tarunbtw/formsy/internal/db"
)

func CreateProject(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)

	body := struct {
		Name   string `json:"name"`
		Schema []any  `json:"schema"`
	}{}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name required"})
	}

	// enforce plan limits
	var count int
	db.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM projects WHERE owner_id = $1`, userID,
	).Scan(&count)

	if count >= 2 {
		// TODO: check plan, for now free tier cap
		return c.Status(403).JSON(fiber.Map{"error": "free tier limit: 2 projects"})
	}

	id, _ := gonanoid.New()
	schema := body.Schema
	if schema == nil {
		schema = []any{}
	}

	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO projects (id, name, owner_id, schema) VALUES ($1, $2, $3, $4)`,
		id, body.Name, userID, schema,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to create project"})
	}

	return c.Status(201).JSON(fiber.Map{"ok": true, "id": id, "endpoint": "/s/" + id})
}

func ListProjects(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)

	rows, err := db.Pool.Query(context.Background(),
		`SELECT id, name, schema, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db error"})
	}
	defer rows.Close()

	projects := []fiber.Map{}
	for rows.Next() {
		var id, name string
		var schema []byte
		var createdAt any
		rows.Scan(&id, &name, &schema, &createdAt)
		projects = append(projects, fiber.Map{
			"id":         id,
			"name":       name,
			"schema":     string(schema),
			"created_at": createdAt,
			"endpoint":   "/s/" + id,
		})
	}

	return c.JSON(fiber.Map{"projects": projects})
}

func DeleteProject(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	projectID := c.Params("project_id")

	result, err := db.Pool.Exec(context.Background(),
		`DELETE FROM projects WHERE id = $1 AND owner_id = $2`,
		projectID, userID,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db error"})
	}

	if result.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}

	return c.JSON(fiber.Map{"ok": true})
}

func UpdateProjectSchema(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	projectID := c.Params("project_id")

	body := struct {
		Schema []any `json:"schema"`
	}{}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}

	result, err := db.Pool.Exec(context.Background(),
		`UPDATE projects SET schema = $1 WHERE id = $2 AND owner_id = $3`,
		body.Schema, projectID, userID,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db error"})
	}

	if result.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}

	return c.JSON(fiber.Map{"ok": true})
}