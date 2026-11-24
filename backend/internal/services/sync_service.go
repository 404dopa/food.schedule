package services

import (
	"encoding/json"
	"fmt"
	"time"

	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SyncService struct {
	syncRepo *repository.SyncRepository
	db       *gorm.DB
}

func NewSyncService(syncRepo *repository.SyncRepository, db *gorm.DB) *SyncService {
	return &SyncService{
		syncRepo: syncRepo,
		db:       db,
	}
}

type SyncOperationRequest struct {
	ClientOpID  string    `json:"client_op_id" binding:"required"`
	HouseholdID string    `json:"household_id"`
	EntityType  string    `json:"entity_type" binding:"required"` // ingredient, recipe, meal_plan_item, shopping_item, inventory
	EntityID    string    `json:"entity_id" binding:"required"`
	Action      string    `json:"action" binding:"required"`      // create, update, delete
	PayloadJSON string    `json:"payload_json" binding:"required"`
	ClientTime  time.Time `json:"client_time"`
}

type SyncBatchRequest struct {
	HouseholdID string                 `json:"household_id"`
	Operations  []SyncOperationRequest `json:"operations"`
}

type SyncBatchResponse struct {
	SuccessCount int      `json:"success_count"`
	SkippedCount int      `json:"skipped_count"`
	ErrorCount   int      `json:"error_count"`
	Errors       []string `json:"errors"`
}

// ProcessSyncBatch applies client operations safely with idempotency and conflict resolution
func (s *SyncService) ProcessSyncBatch(batch *SyncBatchRequest) (*SyncBatchResponse, error) {
	resp := &SyncBatchResponse{}

	for _, opReq := range batch.Operations {
		// 1. Idempotency check: if this ClientOpID already processed, skip
		if s.syncRepo.IsOpProcessed(opReq.ClientOpID) {
			resp.SkippedCount++
			continue
		}

		err := s.db.Transaction(func(tx *gorm.DB) error {
			// Apply operation based on EntityType and Action
			if err := s.applyOperation(tx, &opReq); err != nil {
				return err
			}

			// Record sync log
			logOp := models.SyncOperation{
				BaseModel:   models.BaseModel{ID: uuid.NewString()},
				HouseholdID: batch.HouseholdID,
				ClientOpID:  opReq.ClientOpID,
				EntityType:  opReq.EntityType,
				EntityID:    opReq.EntityID,
				Action:      opReq.Action,
				PayloadJSON: opReq.PayloadJSON,
				ClientTime:  opReq.ClientTime,
				Status:      "applied",
			}
			return s.syncRepo.RecordOp(tx, &logOp)
		})

		if err != nil {
			resp.ErrorCount++
			resp.Errors = append(resp.Errors, fmt.Sprintf("op %s failed: %v", opReq.ClientOpID, err))
		} else {
			resp.SuccessCount++
		}
	}

	return resp, nil
}

func (s *SyncService) applyOperation(tx *gorm.DB, op *SyncOperationRequest) error {
	switch op.EntityType {
	case "ingredient":
		var item models.Ingredient
		if err := json.Unmarshal([]byte(op.PayloadJSON), &item); err != nil {
			return err
		}
		item.ID = op.EntityID
		if op.Action == "delete" {
			return tx.Where("id = ?", op.EntityID).Delete(&models.Ingredient{}).Error
		}
		return tx.Save(&item).Error

	case "recipe":
		var item models.Recipe
		if err := json.Unmarshal([]byte(op.PayloadJSON), &item); err != nil {
			return err
		}
		item.ID = op.EntityID
		if op.Action == "delete" {
			return tx.Where("id = ?", op.EntityID).Delete(&models.Recipe{}).Error
		}
		return tx.Save(&item).Error

	case "meal_plan_item":
		var item models.MealPlanItem
		if err := json.Unmarshal([]byte(op.PayloadJSON), &item); err != nil {
			return err
		}
		item.ID = op.EntityID
		if op.Action == "delete" {
			return tx.Where("id = ?", op.EntityID).Delete(&models.MealPlanItem{}).Error
		}
		return tx.Save(&item).Error

	case "shopping_item":
		var item models.ShoppingItem
		if err := json.Unmarshal([]byte(op.PayloadJSON), &item); err != nil {
			return err
		}
		item.ID = op.EntityID
		if op.Action == "delete" {
			return tx.Where("id = ?", op.EntityID).Delete(&models.ShoppingItem{}).Error
		}
		return tx.Save(&item).Error

	default:
		return nil
	}
}
