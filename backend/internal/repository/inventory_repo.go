package repository

import (
	"errors"
	"time"

	"bayti-kitchen/backend/internal/models"

	"gorm.io/gorm"
)

var (
	ErrInsufficientStock     = errors.New("insufficient stock for ingredient")
	ErrDuplicateTransaction  = errors.New("transaction with this idempotency key already processed")
	ErrInventoryNotFound     = errors.New("inventory record not found")
)

type InventoryRepository struct {
	db *gorm.DB
}

func NewInventoryRepository(db *gorm.DB) *InventoryRepository {
	return &InventoryRepository{db: db}
}

func (r *InventoryRepository) DB() *gorm.DB {
	return r.db
}

func (r *InventoryRepository) GetInventoryByIngredientID(tx *gorm.DB, ingredientID, householdID string) (*models.Inventory, error) {
	db := r.db
	if tx != nil {
		db = tx
	}
	var inv models.Inventory
	err := db.Preload("Ingredient").Preload("Unit").
		Where("ingredient_id = ? AND (household_id = ? OR household_id = '')", ingredientID, householdID).
		First(&inv).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInventoryNotFound
		}
		return nil, err
	}
	return &inv, nil
}

func (r *InventoryRepository) GetAllInventory(householdID, status string) ([]models.Inventory, error) {
	var list []models.Inventory
	query := r.db.Preload("Ingredient").Preload("Ingredient.Group").Preload("Ingredient.DefaultUnit").Preload("Unit").
		Joins("JOIN ingredients ON ingredients.id = inventories.ingredient_id").
		Where("inventories.household_id = ? OR inventories.household_id = ''", householdID)

	switch status {
	case "low":
		// Quantity <= MinStock and Quantity > 0
		query = query.Where("inventories.quantity <= ingredients.min_stock AND inventories.quantity > 0")
	case "out":
		// Quantity <= 0
		query = query.Where("inventories.quantity <= 0")
	case "ok":
		// Quantity > MinStock
		query = query.Where("inventories.quantity > ingredients.min_stock")
	}

	err := query.Order("ingredients.name_ar ASC").Find(&list).Error
	return list, err
}

func (r *InventoryRepository) UpsertInventory(tx *gorm.DB, inv *models.Inventory) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	inv.LastStockAt = time.Now().UTC()
	return db.Save(inv).Error
}

func (r *InventoryRepository) RecordTransaction(tx *gorm.DB, txLog *models.InventoryTransaction) error {
	db := r.db
	if tx != nil {
		db = tx
	}

	if txLog.IdempotencyKey != "" {
		var count int64
		if err := db.Model(&models.InventoryTransaction{}).
			Where("idempotency_key = ?", txLog.IdempotencyKey).
			Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrDuplicateTransaction
		}
	}

	return db.Create(txLog).Error
}

func (r *InventoryRepository) GetTransactions(householdID, ingredientID string, limit int) ([]models.InventoryTransaction, error) {
	var list []models.InventoryTransaction
	query := r.db.Preload("Ingredient").Preload("Unit").
		Where("household_id = ? OR household_id = ''", householdID)

	if ingredientID != "" {
		query = query.Where("ingredient_id = ?", ingredientID)
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	err := query.Order("created_at DESC").Limit(limit).Find(&list).Error
	return list, err
}
