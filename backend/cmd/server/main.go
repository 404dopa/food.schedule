package main

import (
	"log"
	"os"
	"time"

	"bayti-kitchen/backend/internal/config"
	"bayti-kitchen/backend/internal/handlers"
	"bayti-kitchen/backend/internal/repository"
	"bayti-kitchen/backend/internal/seed"
	"bayti-kitchen/backend/internal/services"
)

func main() {
	// Set global timezone to Asia/Baghdad (UTC+3)
	baghdadLoc, tzErr := time.LoadLocation("Asia/Baghdad")
	if tzErr != nil {
		baghdadLoc = time.FixedZone("Asia/Baghdad", 3*60*60)
	}
	time.Local = baghdadLoc

	log.Println("Starting Bayti Kitchen Backend Service (Timezone: Asia/Baghdad UTC+3)...")

	cfg := config.LoadConfig()

	// 1. Initialize Database (SQLite or PostgreSQL)
	db, err := repository.NewDatabase(cfg)
	if err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}

	// 2. Run Auto-Migrations
	if err := db.AutoMigrate(); err != nil {
		log.Fatalf("Fatal: Database auto-migration failed: %v", err)
	}

	// 3. Seed Database
	if err := seed.SeedDatabase(db.DB); err != nil {
		log.Printf("Warning: Database seeding encountered: %v", err)
	}

	// 4. Repositories
	ingRepo := repository.NewIngredientRepository(db.DB)
	invRepo := repository.NewInventoryRepository(db.DB)
	recipeRepo := repository.NewRecipeRepository(db.DB)
	mealPlanRepo := repository.NewMealPlanRepository(db.DB)
	shopRepo := repository.NewShoppingRepository(db.DB)
	syncRepo := repository.NewSyncRepository(db.DB)

	// Ensure default "عامة" groups exist
	_, _ = ingRepo.EnsureDefaultGeneralGroup("default")
	_, _ = recipeRepo.EnsureDefaultGeneralGroup("default")

	// 5. Services
	unitServ := services.NewUnitService()
	invServ := services.NewInventoryService(invRepo, ingRepo, unitServ)
	recipeServ := services.NewRecipeService(recipeRepo, invRepo, unitServ)
	prepServ := services.NewPreparationService(mealPlanRepo, recipeRepo, invRepo, unitServ)
	shopServ := services.NewShoppingService(shopRepo, mealPlanRepo, invRepo, ingRepo, unitServ)
	syncServ := services.NewSyncService(syncRepo, db.DB)
	excelServ := services.NewExcelService(ingRepo, recipeRepo, mealPlanRepo, invRepo, db.DB)

	// 6. Handlers
	appHandler := handlers.NewAppHandler(
		ingRepo,
		invRepo,
		recipeRepo,
		mealPlanRepo,
		shopRepo,
		syncRepo,
		unitServ,
		invServ,
		recipeServ,
		prepServ,
		shopServ,
		syncServ,
		excelServ,
	)

	// 7. Router
	router := handlers.SetupRouter(cfg, appHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = cfg.Port
	}
	if port == "" {
		port = "8080"
	}

	log.Printf("Bayti Kitchen API listening on :%s (DB: %s)", port, cfg.DBType)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}
}
