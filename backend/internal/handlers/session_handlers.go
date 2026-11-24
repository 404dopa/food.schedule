package handlers

import (
	"math/rand"
	"net/http"
	"strings"

	"bayti-kitchen/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// JoinOrCreateFamily handles login: joins an existing family by code, or offers to create a new one.
// POST /api/session/join
// Body: { "user_name": "...", "family_code": "123456" }
// Response:
//   - If family_code matches existing household => joins, returns session
//   - If family_code not found => returns { "suggest_create": true, "family_code": "..." }
//   - If family_code == "" => auto-generates a new household for this user
func (h *AppHandler) JoinOrCreateFamily(c *gin.Context) {
	var req struct {
		UserName   string `json:"user_name" binding:"required"`
		FamilyCode string `json:"family_code"`
		CreateNew  bool   `json:"create_new"` // set true when user confirms "Create new family"
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.UserName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "يرجى إدخال اسمك"})
		return
	}

	userName := strings.TrimSpace(req.UserName)
	familyCode := normalizeArabicDigits(strings.TrimSpace(req.FamilyCode))

	db := h.syncRepo.DB()

	// ── Case 1: a 6-digit family code was provided ──────────────────────────────
	if familyCode != "" {
		if len(familyCode) != 6 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "رمز العائلة يجب أن يتكون من 6 أرقام"})
			return
		}

		var household models.Household
		err := db.Where("name = ?", familyCode).First(&household).Error
		if err == nil {
			// Household exists → join it
			session := buildSession(userName, household.ID, familyCode)
			c.JSON(http.StatusOK, session)
			return
		}

		// Not found
		if !req.CreateNew {
			// Ask user whether to create a new family with this code
			c.JSON(http.StatusOK, gin.H{
				"suggest_create": true,
				"family_code":    familyCode,
				"message":        "لا توجد عائلة بهذا الرمز. هل تريد إنشاء عائلة جديدة برمز " + familyCode + "؟",
			})
			return
		}

		// User confirmed → create household with the given code
		newHousehold := models.Household{
			BaseModel: models.BaseModel{ID: uuid.NewString()},
			Name:      familyCode,
		}
		if err := db.Create(&newHousehold).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء العائلة: " + err.Error()})
			return
		}
		_, _ = h.ingRepo.EnsureDefaultGeneralGroup(newHousehold.ID)
		_, _ = h.recipeRepo.EnsureDefaultGeneralGroup(newHousehold.ID)
		session := buildSession(userName, newHousehold.ID, familyCode)
		c.JSON(http.StatusCreated, session)
		return
	}

	// ── Case 2: no family code → create a brand new household automatically ─────
	newCode := generateFamilyCode(db)
	newHousehold := models.Household{
		BaseModel: models.BaseModel{ID: uuid.NewString()},
		Name:      newCode,
	}
	if err := db.Create(&newHousehold).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء العائلة: " + err.Error()})
		return
	}
	_, _ = h.ingRepo.EnsureDefaultGeneralGroup(newHousehold.ID)
	_, _ = h.recipeRepo.EnsureDefaultGeneralGroup(newHousehold.ID)
	session := buildSession(userName, newHousehold.ID, newCode)
	c.JSON(http.StatusCreated, session)
}

// GetFamilyInfo returns basic info about a household by its household_id header.
// GET /api/session/info
func (h *AppHandler) GetFamilyInfo(c *gin.Context) {
	householdID := c.DefaultQuery("household_id", "")
	if householdID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "household_id مطلوب"})
		return
	}
	db := h.syncRepo.DB()
	var household models.Household
	if err := db.Where("id = ?", householdID).First(&household).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "العائلة غير موجودة"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"household_id": household.ID,
		"family_code":  household.Name,
	})
}

// buildSession assembles the session response returned to the client.
func buildSession(userName, householdID, familyCode string) gin.H {
	return gin.H{
		"user_name":    userName,
		"household_id": householdID,
		"family_code":  familyCode,
	}
}

// generateFamilyCode generates a random 6-digit family code that is not already in use.
func generateFamilyCode(db *gorm.DB) string {
	for {
		code := ""
		for i := 0; i < 6; i++ {
			code += string(rune('0' + rand.Intn(10)))
		}
		var count int64
		db.Model(&models.Household{}).Where("name = ?", code).Count(&count)
		if count == 0 {
			return code
		}
	}
}

// normalizeArabicDigits converts Arabic-Indic and Eastern Arabic digits into standard ASCII 0-9 digits.
func normalizeArabicDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '٠', '۰':
			b.WriteRune('0')
		case '١', '۱':
			b.WriteRune('1')
		case '٢', '۲':
			b.WriteRune('2')
		case '٣', '۳':
			b.WriteRune('3')
		case '٤', '۴':
			b.WriteRune('4')
		case '٥', '۵':
			b.WriteRune('5')
		case '٦', '۶':
			b.WriteRune('6')
		case '٧', '۷':
			b.WriteRune('7')
		case '٨', '۸':
			b.WriteRune('8')
		case '٩', '۹':
			b.WriteRune('9')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}
