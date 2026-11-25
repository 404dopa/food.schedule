package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"bayti-kitchen/backend/internal/config"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter(cfg *config.Config, h *AppHandler) *gin.Engine {
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	h.SetUploadDir(cfg.UploadDir)

	r := gin.Default()

	// CORS Setup
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization", "X-Requested-With", "X-Household-Id"},
		ExposeHeaders:    []string{"Content-Length", "Content-Disposition"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Static uploads directory (persistent Volume) — immutable UUID filenames cached by browser
	if cfg.UploadDir != "" {
		_ = os.MkdirAll(cfg.UploadDir, 0755)
		uploadsGroup := r.Group("/uploads")
		uploadsGroup.Use(func(c *gin.Context) {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
			c.Next()
		})
		uploadsGroup.Static("/", cfg.UploadDir)
	}

	r.GET("/health", h.HealthCheck)

	api := r.Group("/api")
	// Never cache dynamic API data in browsers or proxies
	api.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.Next()
	})
	{
		// Real-time Multi-Device Sync Stream
		api.GET("/events", h.StreamEvents)

		// Image upload endpoint (saves into persistent volume)
		api.POST("/upload", h.UploadImage)
		api.POST("/upload/image", h.UploadImage)

		// Session / Family login (no auth required)
		api.POST("/session/join", h.JoinOrCreateFamily)
		api.GET("/session/info", h.GetFamilyInfo)

		// Units
		api.GET("/units", h.GetUnits)

		// Ingredient Groups
		api.GET("/ingredient-groups", h.GetIngredientGroups)
		api.POST("/ingredient-groups", h.CreateIngredientGroup)
		api.DELETE("/ingredient-groups/:id", h.DeleteIngredientGroup)

		// Ingredients
		api.GET("/ingredients", h.GetIngredients)
		api.POST("/ingredients", h.CreateIngredient)
		api.PUT("/ingredients/:id", h.UpdateIngredient)
		api.DELETE("/ingredients/:id", h.DeleteIngredient)

		// Inventory
		api.GET("/inventory", h.GetInventory)
		api.POST("/inventory/adjust", h.AdjustInventory)
		api.GET("/inventory/transactions", h.GetInventoryTransactions)

		// Recipe Groups
		api.GET("/recipe-groups", h.GetRecipeGroups)
		api.POST("/recipe-groups", h.CreateRecipeGroup)
		api.DELETE("/recipe-groups/:id", h.DeleteRecipeGroup)

		// Recipes
		api.GET("/recipes", h.GetRecipes)
		api.GET("/recipes/:id", h.GetRecipeByID)
		api.POST("/recipes", h.CreateRecipe)
		api.PUT("/recipes/:id", h.UpdateRecipe)
		api.DELETE("/recipes/:id", h.DeleteRecipe)
		api.POST("/recipes/:id/duplicate", h.DuplicateRecipe)

		// Meal Plans & Dashboard
		api.GET("/meal-plans", h.GetMealPlans)
		api.POST("/meal-plans/items", h.AddMealPlanItem)
		api.PUT("/meal-plans/items/:id", h.UpdateMealPlanItem)
		api.DELETE("/meal-plans/items/:id", h.DeleteMealPlanItem)
		api.POST("/meal-plans/skip-day", h.SkipDay)
		api.POST("/meal-plans/copy-week", h.CopyWeek)

		// Monthly Recurring Schedule (الجدول الشهري المتكرر)
		api.GET("/monthly-schedule", h.GetMonthlySchedule)
		api.POST("/monthly-schedule", h.SaveMonthlyScheduleItem)
		api.POST("/monthly-schedule/auto-distribute", h.AutoDistributeMonthlySchedule)
		api.DELETE("/monthly-schedule/:id", h.DeleteMonthlyScheduleItem)

		// Meals Prepare & Unprepare (Atomic Inventory Management)
		api.POST("/meals/prepare", h.PrepareMeal)
		api.POST("/meals/unprepare", h.UnprepareMeal)

		// Shopping Lists
		api.GET("/shopping-lists/active", h.GetActiveShoppingList)
		api.POST("/shopping-lists/generate", h.GenerateSmartShoppingList)
		api.POST("/shopping-lists/items", h.AddShoppingItem)
		api.POST("/shopping-lists/items/buy", h.MarkShoppingItemBought)
		api.DELETE("/shopping-lists/items/:id", h.DeleteShoppingItem)

		// Purchases
		api.GET("/purchases", h.GetPurchases)

		// Offline Sync
		api.POST("/sync", h.SyncBatch)

		// Settings & System Control
		api.GET("/settings", h.GetSettings)
		api.POST("/settings", h.SetSetting)
		api.POST("/system/reset", h.ResetSystem)

		// Excel Import/Export
		api.GET("/excel/export/ingredients", h.ExportIngredientsExcel)
		api.GET("/excel/export/recipes", h.ExportRecipesExcel)
		api.POST("/excel/import/ingredients/preview", h.PreviewImportIngredientsExcel)
		api.POST("/excel/import/ingredients/commit", h.CommitImportIngredientsExcel)
	}

	// Serve Frontend Static SPA if staticDir exists (Single Container Railway Deployment)
	if cfg.StaticDir != "" {
		indexHTML := filepath.Join(cfg.StaticDir, "index.html")
		if _, err := os.Stat(indexHTML); err == nil {
			assetsDir := filepath.Join(cfg.StaticDir, "assets")
			if fi, err := os.Stat(assetsDir); err == nil && fi.IsDir() {
				assetsGroup := r.Group("/assets")
				assetsGroup.Use(func(c *gin.Context) {
					// Cache hashed app shell assets (JS/CSS) in browsers for fast startup
					c.Header("Cache-Control", "public, max-age=31536000, immutable")
					c.Next()
				})
				assetsGroup.Static("/", assetsDir)
			}
			r.StaticFile("/favicon.ico", filepath.Join(cfg.StaticDir, "favicon.ico"))

			// Catch-all route to serve index.html for client-side routing
			r.NoRoute(func(c *gin.Context) {
				path := c.Request.URL.Path
				if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/uploads") {
					c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
					return
				}
				c.Header("Cache-Control", "no-cache")
				c.File(indexHTML)
			})
		}
	}

	return r
}
