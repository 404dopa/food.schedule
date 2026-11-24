package repository

import (
	"bayti-kitchen/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RecipeRepository struct {
	db *gorm.DB
}

func NewRecipeRepository(db *gorm.DB) *RecipeRepository {
	return &RecipeRepository{db: db}
}

// Recipe Groups
func (r *RecipeRepository) EnsureDefaultGeneralGroup(householdID string) (*models.RecipeGroup, error) {
	if householdID == "" {
		householdID = "default"
	}
	var group models.RecipeGroup
	err := r.db.Where("(name_ar = 'عامة' OR name_ar = 'عامه') AND (household_id = ? OR household_id = '')", householdID).First(&group).Error
	if err == nil {
		return &group, nil
	}
	group = models.RecipeGroup{
		BaseModel:   models.BaseModel{ID: "rg_general_" + householdID},
		HouseholdID: householdID,
		NameAr:      "عامة",
		NameEn:      "General",
		Icon:        "Utensils",
		Color:       "#10B981",
	}
	if err := r.db.Create(&group).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

func (r *RecipeRepository) GetGroups(householdID string) ([]models.RecipeGroup, error) {
	var groups []models.RecipeGroup
	err := r.db.Where("household_id = ? OR household_id = ''", householdID).
		Order("name_ar ASC").
		Find(&groups).Error
	return groups, err
}

func (r *RecipeRepository) GetGroupByName(nameAr, householdID string) (*models.RecipeGroup, error) {
	var group models.RecipeGroup
	err := r.db.Where("LOWER(TRIM(name_ar)) = LOWER(TRIM(?)) AND (household_id = ? OR household_id = '')", nameAr, householdID).First(&group).Error
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func (r *RecipeRepository) CountRecipesByGroupID(groupID, householdID string) (int64, error) {
	var count int64
	err := r.db.Model(&models.Recipe{}).Where("group_id = ? AND (household_id = ? OR household_id = '')", groupID, householdID).Count(&count).Error
	return count, err
}

func (r *RecipeRepository) CreateGroup(group *models.RecipeGroup) error {
	return r.db.Create(group).Error
}

func (r *RecipeRepository) UpdateGroup(group *models.RecipeGroup) error {
	return r.db.Save(group).Error
}

func (r *RecipeRepository) DeleteGroup(id, householdID string) error {
	return r.db.Where("id = ? AND (household_id = ? OR household_id = '')", id, householdID).Delete(&models.RecipeGroup{}).Error
}

// Recipes
func (r *RecipeRepository) GetAllRecipes(householdID, groupID, search string) ([]models.Recipe, error) {
	var recipes []models.Recipe
	query := r.db.Preload("Group").
		Preload("Ingredients").
		Preload("Ingredients.Ingredient").
		Preload("Ingredients.Ingredient.DefaultUnit").
		Preload("Ingredients.Ingredient.Inventory").
		Preload("Ingredients.Ingredient.Inventory.Unit").
		Preload("Ingredients.Unit").
		Where("recipes.household_id = ? OR recipes.household_id = ''", householdID)

	if groupID != "" {
		query = query.Where("recipes.group_id = ?", groupID)
	}
	if search != "" {
		likeTerm := "%" + search + "%"
		query = query.Where("recipes.name_ar LIKE ? OR recipes.name_en LIKE ? OR recipes.description LIKE ?", likeTerm, likeTerm, likeTerm)
	}

	err := query.Order("recipes.name_ar ASC").Find(&recipes).Error
	return recipes, err
}

func (r *RecipeRepository) GetRecipeByID(id, householdID string) (*models.Recipe, error) {
	var recipe models.Recipe
	err := r.db.Preload("Group").
		Preload("Ingredients").
		Preload("Ingredients.Ingredient").
		Preload("Ingredients.Ingredient.DefaultUnit").
		Preload("Ingredients.Ingredient.Inventory").
		Preload("Ingredients.Ingredient.Inventory.Unit").
		Preload("Ingredients.Unit").
		Where("id = ? AND (household_id = ? OR household_id = '')", id, householdID).
		First(&recipe).Error
	if err != nil {
		return nil, err
	}
	return &recipe, nil
}

func (r *RecipeRepository) CreateRecipe(recipe *models.Recipe) error {
	for i := range recipe.Ingredients {
		recipe.Ingredients[i].RecipeID = recipe.ID
		if recipe.Ingredients[i].ID == "" {
			recipe.Ingredients[i].ID = uuid.NewString()
		}
	}
	return r.db.Create(recipe).Error
}

func (r *RecipeRepository) UpdateRecipe(recipe *models.Recipe) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(recipe).Error; err != nil {
			return err
		}
		// Delete existing recipe ingredients and recreate them
		if err := tx.Where("recipe_id = ?", recipe.ID).Delete(&models.RecipeIngredient{}).Error; err != nil {
			return err
		}
		for i := range recipe.Ingredients {
			recipe.Ingredients[i].RecipeID = recipe.ID
			if recipe.Ingredients[i].ID == "" {
				recipe.Ingredients[i].ID = uuid.NewString()
			}
			if err := tx.Create(&recipe.Ingredients[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *RecipeRepository) DeleteRecipe(id, householdID string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 1. Delete recipe ingredients
		if err := tx.Where("recipe_id = ?", id).Delete(&models.RecipeIngredient{}).Error; err != nil {
			return err
		}
		// 2. Cascade delete from monthly schedule items (removes recipe from all days in schedule)
		if err := tx.Where("recipe_id = ?", id).Delete(&models.MonthlyScheduleItem{}).Error; err != nil {
			return err
		}
		// 3. Cascade delete from meal plan items
		if err := tx.Where("recipe_id = ?", id).Delete(&models.MealPlanItem{}).Error; err != nil {
			return err
		}
		// 4. Cascade delete from meal preparations
		if err := tx.Where("recipe_id = ?", id).Delete(&models.MealPreparation{}).Error; err != nil {
			return err
		}
		// 5. Delete recipe itself
		return tx.Where("id = ? AND (household_id = ? OR household_id = '')", id, householdID).Delete(&models.Recipe{}).Error
	})
}

func (r *RecipeRepository) DuplicateRecipe(id, householdID, newNameAr string) (*models.Recipe, error) {
	original, err := r.GetRecipeByID(id, householdID)
	if err != nil {
		return nil, err
	}

	clone := *original
	clone.ID = uuid.NewString()
	if newNameAr != "" {
		clone.NameAr = newNameAr
	} else {
		clone.NameAr = original.NameAr + " (نسخة)"
	}

	newIngredients := make([]models.RecipeIngredient, len(original.Ingredients))
	for i, ing := range original.Ingredients {
		newIngredients[i] = models.RecipeIngredient{
			BaseModel:    models.BaseModel{ID: uuid.NewString()},
			RecipeID:     clone.ID,
			IngredientID: ing.IngredientID,
			Quantity:     ing.Quantity,
			UnitID:       ing.UnitID,
			Notes:        ing.Notes,
		}
	}
	clone.Ingredients = newIngredients

	if err := r.CreateRecipe(&clone); err != nil {
		return nil, err
	}
	return &clone, nil
}
