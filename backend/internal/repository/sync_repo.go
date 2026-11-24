package repository

import (
	"bayti-kitchen/backend/internal/models"

	"gorm.io/gorm"
)

type SyncRepository struct {
	db *gorm.DB
}

func NewSyncRepository(db *gorm.DB) *SyncRepository {
	return &SyncRepository{db: db}
}

func (r *SyncRepository) DB() *gorm.DB {
	return r.db
}

func (r *SyncRepository) IsOpProcessed(clientOpID string) bool {
	var count int64
	r.db.Model(&models.SyncOperation{}).Where("client_op_id = ?", clientOpID).Count(&count)
	return count > 0
}

func (r *SyncRepository) RecordOp(tx *gorm.DB, op *models.SyncOperation) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	return db.Create(op).Error
}

func (r *SyncRepository) GetSettings(householdID string) ([]models.Setting, error) {
	var settings []models.Setting
	err := r.db.Where("household_id = ? OR household_id = ''", householdID).Find(&settings).Error
	return settings, err
}

func (r *SyncRepository) SetSetting(setting *models.Setting) error {
	var existing models.Setting
	err := r.db.Where("household_id = ? AND key = ?", setting.HouseholdID, setting.Key).First(&existing).Error
	if err == nil {
		existing.Value = setting.Value
		return r.db.Save(&existing).Error
	}
	return r.db.Create(setting).Error
}
