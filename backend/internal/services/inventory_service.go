package services

import (
	"fmt"
	"time"

	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type InventoryService struct {
	invRepo  *repository.InventoryRepository
	ingRepo  *repository.IngredientRepository
	unitServ *UnitService
}

func NewInventoryService(invRepo *repository.InventoryRepository, ingRepo *repository.IngredientRepository, unitServ *UnitService) *InventoryService {
	return &InventoryService{
		invRepo:  invRepo,
		ingRepo:  ingRepo,
		unitServ: unitServ,
	}
}

type StockAdjustmentRequest struct {
	HouseholdID    string  `json:"household_id"`
	IngredientID   string  `json:"ingredient_id" binding:"required"`
	Quantity       float64 `json:"quantity"` // positive or negative
	UnitID         string  `json:"unit_id" binding:"required"`
	Type           string  `json:"type" binding:"required"` // adjustment, purchase, waste
	Notes          string  `json:"notes"`
	UnitPrice      float64 `json:"unit_price"`
	IdempotencyKey string  `json:"idempotency_key"`
}

func (s *InventoryService) AdjustStock(req *StockAdjustmentRequest) (*models.Inventory, error) {
	if req.IdempotencyKey == "" {
		req.IdempotencyKey = uuid.NewString()
	}

	var updatedInv *models.Inventory
	err := s.invRepo.DB().Transaction(func(tx *gorm.DB) error {
		ing, err := s.ingRepo.GetIngredientByID(req.IngredientID, req.HouseholdID)
		if err != nil {
			return fmt.Errorf("ingredient not found: %w", err)
		}

		targetUnit, err := s.ingRepo.GetUnitByID(req.UnitID)
		if err != nil {
			return fmt.Errorf("unit not found: %w", err)
		}

		// Convert adjustment quantity to ingredient default unit
		defaultUnit := ing.DefaultUnit
		convertedDelta, err := s.unitServ.ConvertQuantity(req.Quantity, targetUnit, defaultUnit, ing.Density)
		if err != nil {
			return fmt.Errorf("unit conversion failed: %w", err)
		}

		inv, err := s.invRepo.GetInventoryByIngredientID(tx, ing.ID, req.HouseholdID)
		if err != nil {
			// If not found, create new
			inv = &models.Inventory{
				BaseModel:    models.BaseModel{ID: uuid.NewString()},
				HouseholdID:  req.HouseholdID,
				IngredientID: ing.ID,
				Quantity:     0,
				UnitID:       defaultUnit.ID,
			}
		}

		newQty := inv.Quantity + convertedDelta
		if newQty < 0 {
			return fmt.Errorf("stock cannot be negative (current: %.2f, change: %.2f)", inv.Quantity, convertedDelta)
		}

		inv.Quantity = newQty
		inv.LastStockAt = time.Now().UTC()
		if err := s.invRepo.UpsertInventory(tx, inv); err != nil {
			return err
		}

		txLog := models.InventoryTransaction{
			BaseModel:      models.BaseModel{ID: uuid.NewString()},
			HouseholdID:    req.HouseholdID,
			IngredientID:   ing.ID,
			Type:           models.TransactionType(req.Type),
			QuantityDelta:  convertedDelta,
			UnitID:         defaultUnit.ID,
			UnitPrice:      req.UnitPrice,
			TotalPrice:     req.UnitPrice * convertedDelta,
			Notes:          req.Notes,
			IdempotencyKey: req.IdempotencyKey,
		}
		if err := s.invRepo.RecordTransaction(tx, &txLog); err != nil {
			return err
		}

		updatedInv = inv
		return nil
	})

	return updatedInv, err
}
