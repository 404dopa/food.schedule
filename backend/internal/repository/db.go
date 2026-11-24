package repository

import (
	"fmt"
	"log"
	"time"

	"bayti-kitchen/backend/internal/config"
	"bayti-kitchen/backend/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Database struct {
	DB *gorm.DB
}

func NewDatabase(cfg *config.Config) (*Database, error) {
	var dialector gorm.Dialector

	switch cfg.DBType {
	case "postgres":
		if cfg.DatabaseURL != "" {
			dialector = postgres.Open(cfg.DatabaseURL)
		} else {
			dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s TimeZone=UTC",
				cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBPort, cfg.DBSSLMode)
			dialector = postgres.Open(dsn)
		}
	case "sqlite":
		fallthrough
	default:
		// Using pure-Go SQLite driver (glebarez/sqlite) which does not require cgo
		dialector = sqlite.Open(cfg.DBFile)
	}

	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	}

	db, err := gorm.Open(dialector, gormConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database (%s): %w", cfg.DBType, err)
	}

	// Connection pool settings
	sqlDB, err := db.DB()
	if err == nil {
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(time.Hour)
	}

	return &Database{DB: db}, nil
}

func (d *Database) AutoMigrate() error {
	log.Println("Running AutoMigration for all Bayti Kitchen models...")
	return d.DB.AutoMigrate(
		&models.User{},
		&models.Household{},
		&models.HouseholdMember{},
		&models.Unit{},
		&models.IngredientGroup{},
		&models.Ingredient{},
		&models.Inventory{},
		&models.InventoryTransaction{},
		&models.RecipeGroup{},
		&models.Recipe{},
		&models.RecipeIngredient{},
		&models.MealPlan{},
		&models.MealPlanItem{},
		&models.MealPreparation{},
		&models.MonthlyScheduleItem{},
		&models.ShoppingList{},
		&models.ShoppingItem{},
		&models.Purchase{},
		&models.PurchaseItem{},
		&models.SyncOperation{},
		&models.Setting{},
	)
}
