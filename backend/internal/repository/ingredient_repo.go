package repository

import (
	"errors"

	"bayti-kitchen/backend/internal/models"

	"gorm.io/gorm"
)

type IngredientRepository struct {
	db *gorm.DB
}

func NewIngredientRepository(db *gorm.DB) *IngredientRepository {
	return &IngredientRepository{db: db}
}

// Units
func (r *IngredientRepository) GetAllUnits() ([]models.Unit, error) {
	var units []models.Unit
	err := r.db.Find(&units).Error
	return units, err
}

func (r *IngredientRepository) GetUnitByCode(code string) (*models.Unit, error) {
	var unit models.Unit
	err := r.db.Where("code = ?", code).First(&unit).Error
	if err != nil {
		return nil, err
	}
	return &unit, nil
}

func (r *IngredientRepository) GetUnitByID(id string) (*models.Unit, error) {
	var unit models.Unit
	err := r.db.Where("id = ?", id).First(&unit).Error
	if err != nil {
		return nil, err
	}
	return &unit, nil
}

// Ingredient Groups
func (r *IngredientRepository) EnsureDefaultGeneralGroup(householdID string) (*models.IngredientGroup, error) {
	if householdID == "" {
		householdID = "default"
	}
	var group models.IngredientGroup
	err := r.db.Where("(name_ar = 'عامة' OR name_ar = 'عامه') AND (household_id = ? OR household_id = '')", householdID).First(&group).Error
	if err == nil {
		return &group, nil
	}
	group = models.IngredientGroup{
		BaseModel:   models.BaseModel{ID: "grp_general_" + householdID},
		HouseholdID: householdID,
		NameAr:      "عامة",
		NameEn:      "General",
		Icon:        "Package",
		Color:       "#10B981",
		SortOrder:   0,
	}
	if err := r.db.Create(&group).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

func (r *IngredientRepository) GetGroups(householdID string) ([]models.IngredientGroup, error) {
	var groups []models.IngredientGroup
	err := r.db.Where("household_id = ? OR household_id = ''", householdID).
		Order("sort_order ASC, name_ar ASC").
		Find(&groups).Error
	return groups, err
}

func (r *IngredientRepository) CreateGroup(group *models.IngredientGroup) error {
	return r.db.Create(group).Error
}

func (r *IngredientRepository) UpdateGroup(group *models.IngredientGroup) error {
	return r.db.Save(group).Error
}

func (r *IngredientRepository) CountIngredientsByGroupID(groupID, householdID string) (int64, error) {
	var count int64
	err := r.db.Model(&models.Ingredient{}).Where("group_id = ? AND (household_id = ? OR household_id = '')", groupID, householdID).Count(&count).Error
	return count, err
}

func (r *IngredientRepository) DeleteGroup(id, householdID string) error {
	return r.db.Where("id = ? AND (household_id = ? OR household_id = '')", id, householdID).Delete(&models.IngredientGroup{}).Error
}

// Ingredients
func (r *IngredientRepository) GetAllIngredients(householdID, groupID, search string) ([]models.Ingredient, error) {
	var ingredients []models.Ingredient
	query := r.db.Preload("Group").Preload("DefaultUnit").Preload("Inventory").Preload("Inventory.Unit").
		Where("ingredients.household_id = ? OR ingredients.household_id = ''", householdID)

	if groupID != "" {
		query = query.Where("ingredients.group_id = ?", groupID)
	}
	if search != "" {
		likeTerm := "%" + search + "%"
		query = query.Where("ingredients.name_ar LIKE ? OR ingredients.name_en LIKE ?", likeTerm, likeTerm)
	}

	err := query.Order("name_ar ASC").Find(&ingredients).Error
	return ingredients, err
}

func (r *IngredientRepository) GetIngredientByID(id, householdID string) (*models.Ingredient, error) {
	var item models.Ingredient
	err := r.db.Preload("Group").Preload("DefaultUnit").Preload("Inventory").Preload("Inventory.Unit").
		Where("id = ? AND (household_id = ? OR household_id = '')", id, householdID).
		First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *IngredientRepository) GetIngredientByName(nameAr, householdID string) (*models.Ingredient, error) {
	var item models.Ingredient
	err := r.db.Preload("DefaultUnit").Preload("Inventory").
		Where("(name_ar = ? OR name_en = ?) AND (household_id = ? OR household_id = '')", nameAr, nameAr, householdID).
		First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

func (r *IngredientRepository) CreateIngredient(tx *gorm.DB, item *models.Ingredient) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	return db.Create(item).Error
}

func (r *IngredientRepository) UpdateIngredient(tx *gorm.DB, item *models.Ingredient) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	return db.Save(item).Error
}

func (r *IngredientRepository) DeleteIngredient(id, householdID string) error {
	return r.db.Where("id = ? AND (household_id = ? OR household_id = '')", id, householdID).Delete(&models.Ingredient{}).Error
}
