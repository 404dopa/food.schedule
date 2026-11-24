package services

import (
	"errors"
	"fmt"
	"time"

	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MissingIngredientErrorItem struct {
	IngredientID   string  `json:"ingredient_id"`
	IngredientName string  `json:"ingredient_name"`
	Required       float64 `json:"required"`
	Available      float64 `json:"available"`
	UnitName       string  `json:"unit_name"`
}

type InsufficientStockError struct {
	MissingItems []MissingIngredientErrorItem `json:"missing_items"`
}

func (e *InsufficientStockError) Error() string {
	return fmt.Sprintf("insufficient stock for %d ingredients", len(e.MissingItems))
}

type PreparationService struct {
	mealPlanRepo *repository.MealPlanRepository
	recipeRepo   *repository.RecipeRepository
	invRepo      *repository.InventoryRepository
	unitServ     *UnitService
}

func NewPreparationService(
	mealPlanRepo *repository.MealPlanRepository,
	recipeRepo *repository.RecipeRepository,
	invRepo *repository.InventoryRepository,
	unitServ *UnitService,
) *PreparationService {
	return &PreparationService{
		mealPlanRepo: mealPlanRepo,
		recipeRepo:   recipeRepo,
		invRepo:      invRepo,
		unitServ:     unitServ,
	}
}

type PrepareMealRequest struct {
	HouseholdID    string `json:"household_id"`
	MealPlanItemID string `json:"meal_plan_item_id" binding:"required"`
	IdempotencyKey string `json:"idempotency_key" binding:"required"`
	Notes          string `json:"notes"`
}

type PrepareMealResponse struct {
	Success        bool                    `json:"success"`
	MealPlanItemID string                  `json:"meal_plan_item_id"`
	RecipeName     string                  `json:"recipe_name"`
	DeductedItems  []DeductedItemSummary   `json:"deducted_items"`
	PreparationID  string                  `json:"preparation_id"`
	AlreadyPrepared bool                   `json:"already_prepared"`
}

type DeductedItemSummary struct {
	IngredientName string  `json:"ingredient_name"`
	DeductedAmount float64 `json:"deducted_amount"`
	UnitName       string  `json:"unit_name"`
	RemainingStock float64 `json:"remaining_stock"`
}

type UnprepareMealRequest struct {
	HouseholdID    string `json:"household_id"`
	MealPlanItemID string `json:"meal_plan_item_id" binding:"required"`
}

type UnprepareMealResponse struct {
	Success        bool     `json:"success"`
	MealPlanItemID string   `json:"meal_plan_item_id"`
	RestoredItems  []string `json:"restored_items"`
}

func (s *PreparationService) PrepareMeal(req *PrepareMealRequest) (*PrepareMealResponse, error) {
	if req.IdempotencyKey == "" {
		return nil, errors.New("idempotency_key is required to prepare a meal")
	}

	// 1. Check idempotency: if already processed with this key or item already prepared
	existingPrep, err := s.mealPlanRepo.GetPreparationByIdempotencyKey(req.IdempotencyKey)
	if err == nil && existingPrep != nil {
		return &PrepareMealResponse{
			Success:         true,
			MealPlanItemID:  existingPrep.MealPlanItemID,
			PreparationID:   existingPrep.ID,
			AlreadyPrepared: true,
		}, nil
	}

	item, err := s.mealPlanRepo.GetItemByID(req.MealPlanItemID)
	if err != nil {
		return nil, fmt.Errorf("meal plan item not found: %w", err)
	}

	if item.IsPrepared {
		return nil, errors.New("this meal item has already been marked as prepared")
	}

	recipe := item.Recipe
	if recipe == nil {
		recipe, err = s.recipeRepo.GetRecipeByID(item.RecipeID, req.HouseholdID)
		if err != nil {
			return nil, fmt.Errorf("recipe not found: %w", err)
		}
	}

	// Servings factor
	servingsRatio := 1.0
	if recipe.Servings > 0 && item.Servings > 0 {
		servingsRatio = float64(item.Servings) / float64(recipe.Servings)
	}

	// Execute within a strict Database Transaction
	var resp *PrepareMealResponse
	txErr := s.mealPlanRepo.DB().Transaction(func(tx *gorm.DB) error {
		// 2. Validate all stock first (All-or-Nothing)
		var missingItems []MissingIngredientErrorItem
		type deductionPlan struct {
			inv             *models.Inventory
			ing             *models.Ingredient
			deductInInvUnit float64
			unit            *models.Unit
		}
		var plan []deductionPlan

		for _, ri := range recipe.Ingredients {
			scaledQty := ri.Quantity * servingsRatio
			ing := ri.Ingredient
			if ing == nil {
				continue
			}

			inv, err := s.invRepo.GetInventoryByIngredientID(tx, ing.ID, req.HouseholdID)
			if err != nil {
				// Inventory record doesn't exist => create record with 0 stock so it is zeroed out
				inv = &models.Inventory{
					BaseModel:    models.BaseModel{ID: uuid.NewString()},
					HouseholdID:  req.HouseholdID,
					IngredientID: ing.ID,
					Quantity:     0,
					UnitID:       ri.UnitID,
					Unit:         ri.Unit,
					LastStockAt:  time.Now().UTC(),
				}
				_ = s.invRepo.UpsertInventory(tx, inv)
				missingItems = append(missingItems, MissingIngredientErrorItem{
					IngredientID:   ing.ID,
					IngredientName: ing.NameAr,
					Required:       scaledQty,
					Available:      0,
					UnitName:       ri.Unit.NameAr,
				})
				plan = append(plan, deductionPlan{
					inv:             inv,
					ing:             ing,
					deductInInvUnit: 0,
					unit:            ri.Unit,
				})
				continue
			}

			// Convert required quantity to inventory's unit
			neededInInvUnit, err := s.unitServ.ConvertQuantity(scaledQty, ri.Unit, inv.Unit, ing.Density)
			if err != nil {
				return fmt.Errorf("cannot convert %s to inventory unit: %w", ing.NameAr, err)
			}

			if inv.Quantity < neededInInvUnit {
				missingItems = append(missingItems, MissingIngredientErrorItem{
					IngredientID:   ing.ID,
					IngredientName: ing.NameAr,
					Required:       neededInInvUnit,
					Available:      inv.Quantity,
					UnitName:       inv.Unit.NameAr,
				})
				// Zero out remaining stock: deduct whatever is left, so remaining becomes 0
				deductAmount := inv.Quantity
				if deductAmount < 0 {
					deductAmount = 0
				}
				plan = append(plan, deductionPlan{
					inv:             inv,
					ing:             ing,
					deductInInvUnit: deductAmount,
					unit:            inv.Unit,
				})
			} else {
				plan = append(plan, deductionPlan{
					inv:             inv,
					ing:             ing,
					deductInInvUnit: neededInInvUnit,
					unit:            inv.Unit,
				})
			}
		}

		// Proceed with preparation even if some items had shortage (they have been zeroed out)
		_ = missingItems

		// 3. Perform deductions and log transactions
		prepID := uuid.NewString()
		now := time.Now().UTC()
		var deductedSummaries []DeductedItemSummary

		for _, p := range plan {
			p.inv.Quantity -= p.deductInInvUnit
			if p.inv.Quantity < 0.00001 {
				p.inv.Quantity = 0
			}
			p.inv.LastStockAt = now
			if err := s.invRepo.UpsertInventory(tx, p.inv); err != nil {
				return err
			}

			if p.deductInInvUnit > 0 {
				txLog := models.InventoryTransaction{
					BaseModel:      models.BaseModel{ID: uuid.NewString()},
					HouseholdID:    req.HouseholdID,
					IngredientID:   p.ing.ID,
					Type:           models.TxTypeConsumption,
					QuantityDelta:  -p.deductInInvUnit,
					UnitID:         p.unit.ID,
					UnitPrice:      p.ing.UnitPrice,
					TotalPrice:     p.ing.UnitPrice * p.deductInInvUnit,
					ReferenceID:    prepID,
					Notes:          fmt.Sprintf("تحضير وجبة: %s", recipe.NameAr),
					IdempotencyKey: fmt.Sprintf("%s_%s", req.IdempotencyKey, p.ing.ID),
				}
				if err := s.invRepo.RecordTransaction(tx, &txLog); err != nil {
					return err
				}
			}

			deductedSummaries = append(deductedSummaries, DeductedItemSummary{
				IngredientName: p.ing.NameAr,
				DeductedAmount: p.deductInInvUnit,
				UnitName:       p.unit.NameAr,
				RemainingStock: p.inv.Quantity,
			})
		}

		// 4. Record preparation (Clean up any previous preparation record for this item first)
		_ = tx.Unscoped().Where("meal_plan_item_id = ?", item.ID).Delete(&models.MealPreparation{}).Error

		prep := models.MealPreparation{
			BaseModel:      models.BaseModel{ID: prepID},
			HouseholdID:    req.HouseholdID,
			MealPlanItemID: item.ID,
			RecipeID:       recipe.ID,
			PreparedAt:     now,
			Servings:       item.Servings,
			IdempotencyKey: req.IdempotencyKey,
			Notes:          req.Notes,
		}
		if err := s.mealPlanRepo.CreatePreparation(tx, &prep); err != nil {
			return err
		}

		// 5. Update MealPlanItem status without touching associations
		item.IsPrepared = true
		item.Preparation = nil
		if err := tx.Model(&models.MealPlanItem{}).Where("id = ?", item.ID).Update("is_prepared", true).Error; err != nil {
			return err
		}

		resp = &PrepareMealResponse{
			Success:        true,
			MealPlanItemID: item.ID,
			RecipeName:     recipe.NameAr,
			DeductedItems:  deductedSummaries,
			PreparationID:  prepID,
		}
		return nil
	})

	if txErr != nil {
		return nil, txErr
	}

	return resp, nil
}

func (s *PreparationService) UnprepareMeal(req *UnprepareMealRequest) (*UnprepareMealResponse, error) {
	if req.MealPlanItemID == "" {
		return nil, errors.New("meal_plan_item_id is required")
	}

	item, err := s.mealPlanRepo.GetItemByID(req.MealPlanItemID)
	if err != nil {
		return nil, fmt.Errorf("meal plan item not found: %w", err)
	}

	if !item.IsPrepared {
		return nil, errors.New("this meal item is not marked as prepared")
	}

	var restored []string
	now := time.Now().UTC()

	txErr := s.mealPlanRepo.DB().Transaction(func(tx *gorm.DB) error {
		// 1. Find preparation record if exists
		var prep models.MealPreparation
		hasPrep := false
		if err := tx.Where("meal_plan_item_id = ?", item.ID).Order("created_at DESC").First(&prep).Error; err == nil {
			hasPrep = true
		}

		if hasPrep {
			// Find related consumption transactions to restore exact deducted stock
			var txLogs []models.InventoryTransaction
			if err := tx.Where("reference_id = ? AND type = ?", prep.ID, models.TxTypeConsumption).Find(&txLogs).Error; err == nil {
				for _, log := range txLogs {
					var inv models.Inventory
					if err := tx.Where("ingredient_id = ? AND (household_id = ? OR household_id = '')", log.IngredientID, req.HouseholdID).First(&inv).Error; err == nil {
						// QuantityDelta was negative, subtracting it adds back the quantity
						inv.Quantity -= log.QuantityDelta
						inv.LastStockAt = now
						if err := tx.Save(&inv).Error; err != nil {
							return err
						}

						// Record adjustment transaction
						revTx := models.InventoryTransaction{
							BaseModel:     models.BaseModel{ID: uuid.NewString()},
							HouseholdID:   req.HouseholdID,
							IngredientID:  log.IngredientID,
							Type:          models.TxTypeAdjustment,
							QuantityDelta: -log.QuantityDelta,
							UnitID:        log.UnitID,
							UnitPrice:     log.UnitPrice,
							TotalPrice:    log.UnitPrice * (-log.QuantityDelta),
							ReferenceID:   item.ID,
							Notes:         "تراجع عن تحضير وجبة واستعادة المخزون",
						}
						_ = tx.Create(&revTx).Error
						restored = append(restored, log.IngredientID)
					}
				}
			}
			_ = tx.Unscoped().Delete(&prep).Error
		} else {
			// Fallback: restore from recipe ingredients if prep record not found
			recipe := item.Recipe
			if recipe == nil && item.RecipeID != "" {
				recipe, _ = s.recipeRepo.GetRecipeByID(item.RecipeID, req.HouseholdID)
			}
			if recipe != nil {
				servingsRatio := 1.0
				if recipe.Servings > 0 && item.Servings > 0 {
					servingsRatio = float64(item.Servings) / float64(recipe.Servings)
				}
				for _, ri := range recipe.Ingredients {
					if ri.Ingredient == nil {
						continue
					}
					var inv models.Inventory
					if err := tx.Where("ingredient_id = ? AND (household_id = ? OR household_id = '')", ri.IngredientID, req.HouseholdID).First(&inv).Error; err == nil {
						scaledQty := ri.Quantity * servingsRatio
						neededInInvUnit, convErr := s.unitServ.ConvertQuantity(scaledQty, ri.Unit, inv.Unit, ri.Ingredient.Density)
						if convErr == nil {
							inv.Quantity += neededInInvUnit
							inv.LastStockAt = now
							_ = tx.Save(&inv).Error
							restored = append(restored, ri.Ingredient.NameAr)
						}
					}
				}
			}
		}

		// 2. Set item IsPrepared to false without touching associations
		item.IsPrepared = false
		item.Preparation = nil
		if err := tx.Model(&models.MealPlanItem{}).Where("id = ?", item.ID).Update("is_prepared", false).Error; err != nil {
			return err
		}
		return nil
	})

	if txErr != nil {
		return nil, txErr
	}

	return &UnprepareMealResponse{
		Success:        true,
		MealPlanItemID: item.ID,
		RestoredItems:  restored,
	}, nil
}
