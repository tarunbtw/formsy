package middleware

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/tarunbtw/formsy/internal/db"
)

func RequireAuth(c *fiber.Ctx) error {
	sessionID := c.Get("X-Session-Id")
	if sessionID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	var userID string
	var expiresAt time.Time

	err := db.Pool.QueryRow(context.Background(),
		`SELECT user_id, expires_at FROM sessions WHERE id = $1`,
		sessionID,
	).Scan(&userID, &expiresAt)

	if err != nil || time.Now().After(expiresAt) {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}

	c.Locals("user_id", userID)
	return c.Next()
}