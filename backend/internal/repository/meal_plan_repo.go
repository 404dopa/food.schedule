package repository

import (
	"fmt"
	"time"

	"bayti-kitchen/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MealPlanRepository struct {
	db *gorm.DB
}

func NewMealPlanRepository(db *gorm.DB) *MealPlanRepository {
	return &MealPlanRepository{db: db}
}

func (r *MealPlanRepository) DB() *gorm.DB {
	return r.db
}

func (r *MealPlanRepository) GetOrCreateActivePlan(householdID, startDate, endDate string) (*models.MealPlan, error) {
	var plan models.MealPlan
	err := r.db.Where("household_id = ? AND start_date <= ? AND end_date >= ?", householdID, endDate, startDate).
		First(&plan).Error
	if err == nil {
		return &plan, nil
	}

	// Create new plan for this range
	newPlan := models.MealPlan{
		BaseModel:   models.BaseModel{ID: uuid.NewString()},
		HouseholdID: householdID,
		Name:        fmt.Sprintf("جدول من %s إلى %s", startDate, endDate),
		Type:        models.PlanWeekly,
		StartDate:   startDate,
		EndDate:     endDate,
	}
	if err := r.db.Create(&newPlan).Error; err != nil {
		return nil, err
	}
	return &newPlan, nil
}

func (r *MealPlanRepository) GetItemsByDateRange(householdID, startDate, endDate string) ([]models.MealPlanItem, error) {
	var items []models.MealPlanItem
	err := r.db.Preload("Recipe").
		Preload("Recipe.Group").
		Preload("Recipe.Ingredients").
		Preload("Recipe.Ingredients.Ingredient").
		Preload("Recipe.Ingredients.Ingredient.DefaultUnit").
		Preload("Recipe.Ingredients.Ingredient.Inventory").
		Preload("Recipe.Ingredients.Ingredient.Inventory.Unit").
		Preload("Recipe.Ingredients.Unit").
		Preload("Preparation").
		Joins("JOIN meal_plans ON meal_plans.id = meal_plan_items.meal_plan_id").
		Where("(meal_plans.household_id = ? OR meal_plans.household_id = '') AND plan_date >= ? AND plan_date <= ?", householdID, startDate, endDate).
		Order("plan_date ASC, sort_order ASC, slot ASC").
		Find(&items).Error
	return items, err
}

func (r *MealPlanRepository) GetItemByID(id string) (*models.MealPlanItem, error) {
	var item models.MealPlanItem
	err := r.db.Preload("Recipe").
		Preload("Recipe.Ingredients").
		Preload("Recipe.Ingredients.Ingredient").
		Preload("Recipe.Ingredients.Ingredient.DefaultUnit").
		Preload("Recipe.Ingredients.Ingredient.Inventory").
		Preload("Recipe.Ingredients.Ingredient.Inventory.Unit").
		Preload("Recipe.Ingredients.Unit").
		Preload("Preparation").
		Where("id = ?", id).First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *MealPlanRepository) GetItemByDateAndSlot(householdID, planDate string, slot models.MealSlot) (*models.MealPlanItem, error) {
	var item models.MealPlanItem
	err := r.db.Preload("Recipe").
		Preload("Recipe.Ingredients").
		Preload("Recipe.Ingredients.Ingredient").
		Preload("Recipe.Ingredients.Ingredient.DefaultUnit").
		Preload("Recipe.Ingredients.Ingredient.Inventory").
		Preload("Recipe.Ingredients.Ingredient.Inventory.Unit").
		Preload("Recipe.Ingredients.Unit").
		Preload("Preparation").
		Joins("JOIN meal_plans ON meal_plans.id = meal_plan_items.meal_plan_id").
		Where("(meal_plans.household_id = ? OR meal_plans.household_id = '') AND plan_date = ? AND slot = ?", householdID, planDate, slot).
		First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *MealPlanRepository) AddItem(item *models.MealPlanItem) error {
	if item.ID == "" {
		item.ID = uuid.NewString()
	}
	return r.db.Create(item).Error
}

func (r *MealPlanRepository) UpdateItem(item *models.MealPlanItem) error {
	return r.db.Save(item).Error
}

func (r *MealPlanRepository) DeleteItem(id string) error {
	return r.db.Where("id = ?", id).Delete(&models.MealPlanItem{}).Error
}

func (r *MealPlanRepository) SkipDay(householdID, date string, skip bool) error {
	return r.db.Model(&models.MealPlanItem{}).
		Where("plan_date = ?", date).
		Update("is_skipped", skip).Error
}

func (r *MealPlanRepository) CopyWeekPlan(householdID, sourceStartDate, targetStartDate string) error {
	srcStart, err := time.Parse("2006-01-02", sourceStartDate)
	if err != nil {
		return err
	}
	tgtStart, err := time.Parse("2006-01-02", targetStartDate)
	if err != nil {
		return err
	}

	srcEnd := srcStart.AddDate(0, 0, 6).Format("2006-01-02")
	tgtEnd := tgtStart.AddDate(0, 0, 6).Format("2006-01-02")

	srcItems, err := r.GetItemsByDateRange(householdID, sourceStartDate, srcEnd)
	if err != nil {
		return err
	}
	if len(srcItems) == 0 {
		return fmt.Errorf("no meal plan found for source week starting %s", sourceStartDate)
	}

	targetPlan, err := r.GetOrCreateActivePlan(householdID, targetStartDate, tgtEnd)
	if err != nil {
		return err
	}

	daysDiff := int(tgtStart.Sub(srcStart).Hours() / 24)

	return r.db.Transaction(func(tx *gorm.DB) error {
		// Clean existing items in target range
		if err := tx.Where("meal_plan_id = ? AND plan_date >= ? AND plan_date <= ?", targetPlan.ID, targetStartDate, tgtEnd).
			Delete(&models.MealPlanItem{}).Error; err != nil {
			return err
		}

		for _, item := range srcItems {
			origDate, err := time.Parse("2006-01-02", item.PlanDate)
			if err != nil {
				continue
			}
			newDate := origDate.AddDate(0, 0, daysDiff).Format("2006-01-02")

			newItem := models.MealPlanItem{
				BaseModel:   models.BaseModel{ID: uuid.NewString()},
				MealPlanID:  targetPlan.ID,
				PlanDate:    newDate,
				Slot:        item.Slot,
				RecipeID:    item.RecipeID,
				Servings:    item.Servings,
				IsSkipped:   false,
				IsPrepared:  false,
				SortOrder:   item.SortOrder,
				Notes:       item.Notes,
			}
			if err := tx.Create(&newItem).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// Meal Preparation
func (r *MealPlanRepository) CreatePreparation(tx *gorm.DB, prep *models.MealPreparation) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	return db.Create(prep).Error
}

func (r *MealPlanRepository) GetPreparationByIdempotencyKey(key string) (*models.MealPreparation, error) {
	var prep models.MealPreparation
	err := r.db.Where("idempotency_key = ?", key).First(&prep).Error
	if err != nil {
		return nil, err
	}
	return &prep, nil
}

// Monthly Recurring Schedule
func (r *MealPlanRepository) GetMonthlySchedule(householdID string) ([]models.MonthlyScheduleItem, error) {
	var items []models.MonthlyScheduleItem
	err := r.db.Preload("Recipe").
		Preload("Recipe.Group").
		Preload("Recipe.Ingredients").
		Preload("Recipe.Ingredients.Ingredient").
		Preload("Recipe.Ingredients.Unit").
		Where("household_id = ? OR household_id = ''", householdID).
		Order("day_of_month ASC, slot ASC").
		Find(&items).Error
	return items, err
}

func (r *MealPlanRepository) SaveMonthlyScheduleItem(item *models.MonthlyScheduleItem) error {
	if item.ID == "" {
		item.ID = uuid.NewString()
	}
	if item.HouseholdID == "" {
		item.HouseholdID = "default"
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Clean up any existing item for this day and slot to ensure absolute uniqueness
		if err := tx.Where("(household_id = ? OR household_id = '') AND day_of_month = ? AND slot = ?", item.HouseholdID, item.DayOfMonth, item.Slot).
			Delete(&models.MonthlyScheduleItem{}).Error; err != nil {
			return err
		}
		return tx.Create(item).Error
	})
}

func (r *MealPlanRepository) DeleteMonthlyScheduleItem(id string) error {
	return r.db.Where("id = ?", id).Delete(&models.MonthlyScheduleItem{}).Error
}
