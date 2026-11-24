package repository

import (
	"bayti-kitchen/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ShoppingRepository struct {
	db *gorm.DB
}

func NewShoppingRepository(db *gorm.DB) *ShoppingRepository {
	return &ShoppingRepository{db: db}
}

func (r *ShoppingRepository) DB() *gorm.DB {
	return r.db
}

func (r *ShoppingRepository) GetOrCreateActiveList(householdID string) (*models.ShoppingList, error) {
	var list models.ShoppingList
	err := r.db.Preload("Items").
		Preload("Items.Ingredient").
		Preload("Items.Ingredient.Group").
		Preload("Items.Ingredient.DefaultUnit").
		Preload("Items.Unit").
		Preload("Items.Group").
		Where("household_id = ? AND status = ?", householdID, models.ShoppingActive).
		First(&list).Error
	if err == nil {
		return &list, nil
	}

	newList := models.ShoppingList{
		BaseModel:   models.BaseModel{ID: uuid.NewString()},
		HouseholdID: householdID,
		Title:       "قائمة التسوق الحالية",
		Status:      models.ShoppingActive,
	}
	if err := r.db.Create(&newList).Error; err != nil {
		return nil, err
	}
	return &newList, nil
}

func (r *ShoppingRepository) GetListByID(id string) (*models.ShoppingList, error) {
	var list models.ShoppingList
	err := r.db.Preload("Items").
		Preload("Items.Ingredient").
		Preload("Items.Ingredient.Group").
		Preload("Items.Ingredient.DefaultUnit").
		Preload("Items.Unit").
		Preload("Items.Group").
		Where("id = ?", id).First(&list).Error
	if err != nil {
		return nil, err
	}
	return &list, nil
}

func (r *ShoppingRepository) AddItem(item *models.ShoppingItem) error {
	if item.ID == "" {
		item.ID = uuid.NewString()
	}
	return r.db.Create(item).Error
}

func (r *ShoppingRepository) UpdateItem(tx *gorm.DB, item *models.ShoppingItem) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	return db.Save(item).Error
}

func (r *ShoppingRepository) DeleteItem(id string) error {
	return r.db.Where("id = ?", id).Delete(&models.ShoppingItem{}).Error
}

func (r *ShoppingRepository) CreatePurchase(tx *gorm.DB, p *models.Purchase) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	return db.Create(p).Error
}

func (r *ShoppingRepository) GetAllPurchases(householdID string, limit int) ([]models.Purchase, error) {
	var purchases []models.Purchase
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	err := r.db.Preload("Items").
		Preload("Items.Ingredient").
		Preload("Items.Unit").
		Where("household_id = ? OR household_id = ''", householdID).
		Order("date DESC").
		Limit(limit).
		Find(&purchases).Error
	return purchases, err
}
