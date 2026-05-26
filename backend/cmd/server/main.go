package main

import (
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/joho/godotenv"
	"github.com/tarunbtw/formsy/internal/db"
	"github.com/tarunbtw/formsy/internal/handler"
	"time"
	"github.com/tarunbtw/formsy/internal/middleware"
)

func main() {
	godotenv.Load()

	if err := db.Connect(); err != nil {
		log.Fatal("db connect failed:", err)
	}
	if err := db.Migrate(); err != nil {
		log.Fatal("migration failed:", err)
	}

	app := fiber.New(fiber.Config{
		BodyLimit: 256 * 1024, // 256kb max
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "POST",
	}))

	// rate limit: 20 req/min per IP on submit route
	submitLimiter := limiter.New(limiter.Config{
		Max:        20,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP() + ":" + c.Params("project_id")
		},
	})

	app.Post("/s/:project_id", submitLimiter, handler.Submit)
    app.Get("/health", func(c *fiber.Ctx) error { return c.SendString("ok") })
	// protected routes
    api := app.Group("/api", middleware.RequireAuth)
	api.Post("/projects", handler.CreateProject)
	api.Get("/projects", handler.ListProjects)
	api.Delete("/projects/:project_id", handler.DeleteProject)
	api.Patch("/projects/:project_id/schema", handler.UpdateProjectSchema)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Fatal(app.Listen(":" + port))
}