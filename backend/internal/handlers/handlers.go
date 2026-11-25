package handlers

import (
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"
	"bayti-kitchen/backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AppHandler struct {
	ingRepo      *repository.IngredientRepository
	invRepo      *repository.InventoryRepository
	recipeRepo   *repository.RecipeRepository
	mealPlanRepo *repository.MealPlanRepository
	shopRepo     *repository.ShoppingRepository
	syncRepo     *repository.SyncRepository
	unitServ     *services.UnitService
	invServ      *services.InventoryService
	recipeServ   *services.RecipeService
	prepServ     *services.PreparationService
	shopServ     *services.ShoppingService
	syncServ     *services.SyncService
	excelServ    *services.ExcelService
	hub          *EventHub
	uploadDir    string
}

func (h *AppHandler) SetUploadDir(dir string) {
	h.uploadDir = dir
}

func NewAppHandler(
	ingRepo *repository.IngredientRepository,
	invRepo *repository.InventoryRepository,
	recipeRepo *repository.RecipeRepository,
	mealPlanRepo *repository.MealPlanRepository,
	shopRepo *repository.ShoppingRepository,
	syncRepo *repository.SyncRepository,
	unitServ *services.UnitService,
	invServ *services.InventoryService,
	recipeServ *services.RecipeService,
	prepServ *services.PreparationService,
	shopServ *services.ShoppingService,
	syncServ *services.SyncService,
	excelServ *services.ExcelService,
) *AppHandler {
	return &AppHandler{
		ingRepo:      ingRepo,
		invRepo:      invRepo,
		recipeRepo:   recipeRepo,
		mealPlanRepo: mealPlanRepo,
		shopRepo:     shopRepo,
		syncRepo:     syncRepo,
		unitServ:     unitServ,
		invServ:      invServ,
		recipeServ:   recipeServ,
		prepServ:     prepServ,
		shopServ:     shopServ,
		syncServ:     syncServ,
		excelServ:    excelServ,
		hub:          NewEventHub(),
	}
}

// Health Check
func (h *AppHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "bayti-kitchen-api",
		"time":    time.Now().UTC(),
	})
}

// getHouseholdID extracts household_id from query parameter or header, defaulting to "default".
func (h *AppHandler) getHouseholdID(c *gin.Context) string {
	if hid := c.Query("household_id"); hid != "" {
		return hid
	}
	if hid := c.GetHeader("X-Household-Id"); hid != "" {
		return hid
	}
	return "default"
}

// Units
func (h *AppHandler) GetUnits(c *gin.Context) {
	units, err := h.ingRepo.GetAllUnits()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, units)
}

// Ingredient Groups
func (h *AppHandler) GetIngredientGroups(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	groups, err := h.ingRepo.GetGroups(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, groups)
}

func (h *AppHandler) CreateIngredientGroup(c *gin.Context) {
	var group models.IngredientGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if group.ID == "" {
		group.ID = uuid.NewString()
	}
	if group.HouseholdID == "" {
		group.HouseholdID = h.getHouseholdID(c)
	}
	if err := h.ingRepo.CreateGroup(&group); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("ingredient_group_updated")
	c.JSON(http.StatusCreated, group)
}

func (h *AppHandler) DeleteIngredientGroup(c *gin.Context) {
	id := c.Param("id")
	householdID := h.getHouseholdID(c)

	// Condition: يمنع حذف مجموعة تحتوي مكونات
	count, err := h.ingRepo.CountIngredientsByGroupID(id, householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("لا يمكن حذف هذه المجموعة لأنها تحتوي على %d مكون. يرجى نقل أو حذف المكونات أولاً.", count),
		})
		return
	}

	if err := h.ingRepo.DeleteGroup(id, householdID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("ingredient_group_updated")
	c.JSON(http.StatusOK, gin.H{"message": "تم حذف المجموعة بنجاح"})
}

// Ingredients
func (h *AppHandler) GetIngredients(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	groupID := c.Query("group_id")
	search := c.Query("search")

	list, err := h.ingRepo.GetAllIngredients(householdID, groupID, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) CreateIngredient(c *gin.Context) {
	var req struct {
		models.Ingredient
		InitialQuantity float64 `json:"initial_quantity"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ing := req.Ingredient
	if ing.ID == "" {
		ing.ID = uuid.NewString()
	}
	if ing.HouseholdID == "" {
		ing.HouseholdID = h.getHouseholdID(c)
	}

	err := h.invRepo.DB().Transaction(func(tx *gorm.DB) error {
		if err := h.ingRepo.CreateIngredient(tx, &ing); err != nil {
			return err
		}

		// Initial stock
		inv := models.Inventory{
			BaseModel:    models.BaseModel{ID: uuid.NewString()},
			HouseholdID:  ing.HouseholdID,
			IngredientID: ing.ID,
			Quantity:     req.InitialQuantity,
			UnitID:       ing.DefaultUnitID,
			LastStockAt:  time.Now().UTC(),
		}
		return h.invRepo.UpsertInventory(tx, &inv)
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	created, _ := h.ingRepo.GetIngredientByID(ing.ID, ing.HouseholdID)
	h.hub.Broadcast("inventory_updated")
	c.JSON(http.StatusCreated, created)
}

func (h *AppHandler) UpdateIngredient(c *gin.Context) {
	id := c.Param("id")
	var ing models.Ingredient
	if err := c.ShouldBindJSON(&ing); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ing.ID = id
	if ing.HouseholdID == "" {
		ing.HouseholdID = h.getHouseholdID(c)
	}

	if err := h.ingRepo.UpdateIngredient(nil, &ing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	updated, _ := h.ingRepo.GetIngredientByID(id, ing.HouseholdID)
	h.hub.Broadcast("inventory_updated")
	c.JSON(http.StatusOK, updated)
}

func (h *AppHandler) DeleteIngredient(c *gin.Context) {
	id := c.Param("id")
	householdID := h.getHouseholdID(c)
	if err := h.ingRepo.DeleteIngredient(id, householdID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("inventory_updated")
	c.JSON(http.StatusOK, gin.H{"message": "deleted successfully"})
}

// Inventory
func (h *AppHandler) GetInventory(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	status := c.Query("status") // low, out, ok
	list, err := h.invRepo.GetAllInventory(householdID, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) AdjustInventory(c *gin.Context) {
	var req services.StockAdjustmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.HouseholdID == "" {
		req.HouseholdID = h.getHouseholdID(c)
	}

	updated, err := h.invServ.AdjustStock(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("inventory_updated")
	c.JSON(http.StatusOK, updated)
}

func (h *AppHandler) GetInventoryTransactions(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	ingredientID := c.Query("ingredient_id")
	list, err := h.invRepo.GetTransactions(householdID, ingredientID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// Recipe Groups
func (h *AppHandler) GetRecipeGroups(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	groups, err := h.recipeRepo.GetGroups(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, groups)
}

func (h *AppHandler) CreateRecipeGroup(c *gin.Context) {
	var group models.RecipeGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	nameAr := strings.TrimSpace(group.NameAr)
	if nameAr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "اسم التصنيف مطلوب"})
		return
	}
	group.NameAr = nameAr
	if group.HouseholdID == "" {
		group.HouseholdID = h.getHouseholdID(c)
	}

	// Condition: يمنع اضافة تصنيف مكرر
	existing, _ := h.recipeRepo.GetGroupByName(group.NameAr, group.HouseholdID)
	if existing != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "يوجد تصنيف بهذا الاسم مسبقاً، يمنع إضافة تصنيف مكرر"})
		return
	}

	if group.ID == "" {
		group.ID = uuid.NewString()
	}

	if err := h.recipeRepo.CreateGroup(&group); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("recipe_group_updated")
	c.JSON(http.StatusCreated, group)
}

func (h *AppHandler) DeleteRecipeGroup(c *gin.Context) {
	id := c.Param("id")
	householdID := h.getHouseholdID(c)

	// Condition: يمنع حذف تصنيف يحتوي ايتمات
	count, err := h.recipeRepo.CountRecipesByGroupID(id, householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("لا يمكن حذف هذا التصنيف لأنه يحتوي على %d وصفة. يرجى نقل أو حذف الوصفات أولاً.", count),
		})
		return
	}

	if err := h.recipeRepo.DeleteGroup(id, householdID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("recipe_group_updated")
	c.JSON(http.StatusOK, gin.H{"message": "تم حذف التصنيف بنجاح"})
}

// Recipes
func (h *AppHandler) GetRecipes(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	groupID := c.Query("group_id")
	search := c.Query("search")

	list, err := h.recipeRepo.GetAllRecipes(householdID, groupID, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.recipeServ.EnrichRecipes(list)
	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) GetRecipeByID(c *gin.Context) {
	id := c.Param("id")
	householdID := h.getHouseholdID(c)

	rec, err := h.recipeRepo.GetRecipeByID(id, householdID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "recipe not found"})
		return
	}
	h.recipeServ.EnrichRecipe(rec)
	c.JSON(http.StatusOK, rec)
}

func (h *AppHandler) CreateRecipe(c *gin.Context) {
	var rec models.Recipe
	if err := c.ShouldBindJSON(&rec); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if rec.ID == "" {
		rec.ID = uuid.NewString()
	}
	if rec.HouseholdID == "" {
		rec.HouseholdID = h.getHouseholdID(c)
	}
	if err := h.recipeRepo.CreateRecipe(&rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	saved, _ := h.recipeRepo.GetRecipeByID(rec.ID, rec.HouseholdID)
	h.recipeServ.EnrichRecipe(saved)
	h.hub.Broadcast("recipe_updated")
	c.JSON(http.StatusCreated, saved)
}

func (h *AppHandler) UpdateRecipe(c *gin.Context) {
	id := c.Param("id")
	var rec models.Recipe
	if err := c.ShouldBindJSON(&rec); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rec.ID = id
	if rec.HouseholdID == "" {
		rec.HouseholdID = h.getHouseholdID(c)
	}

	if err := h.recipeRepo.UpdateRecipe(&rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	saved, _ := h.recipeRepo.GetRecipeByID(rec.ID, rec.HouseholdID)
	h.recipeServ.EnrichRecipe(saved)
	h.hub.Broadcast("recipe_updated")
	c.JSON(http.StatusOK, saved)
}

func (h *AppHandler) DeleteRecipe(c *gin.Context) {
	id := c.Param("id")
	householdID := h.getHouseholdID(c)
	if err := h.recipeRepo.DeleteRecipe(id, householdID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("recipe_updated")
	c.JSON(http.StatusOK, gin.H{"message": "recipe deleted"})
}

func (h *AppHandler) DuplicateRecipe(c *gin.Context) {
	id := c.Param("id")
	householdID := h.getHouseholdID(c)
	var req struct {
		NameAr string `json:"name_ar"`
	}
	_ = c.ShouldBindJSON(&req)

	clone, err := h.recipeRepo.DuplicateRecipe(id, householdID, req.NameAr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.recipeServ.EnrichRecipe(clone)
	c.JSON(http.StatusCreated, clone)
}

// Meal Plans & Dashboard
func (h *AppHandler) GetMealPlans(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	if startDate == "" {
		now := time.Now()
		startDate = now.AddDate(0, 0, -1).Format("2006-01-02")
	}
	if endDate == "" {
		now := time.Now()
		endDate = now.AddDate(0, 0, 7).Format("2006-01-02")
	}

	// Real-time synchronization: Mirror monthly schedule items for today and tomorrow into meal plans
	now := time.Now()
	targetDates := []time.Time{now, now.AddDate(0, 0, 1)}
	var monthlyAll []models.MonthlyScheduleItem
	monthlyLoaded := false

	for _, targetDate := range targetDates {
		targetStr := targetDate.Format("2006-01-02")
		if startDate <= targetStr && endDate >= targetStr {
			if !monthlyLoaded {
				monthlyAll, _ = h.mealPlanRepo.GetMonthlySchedule(householdID)
				monthlyLoaded = true
			}
			validScheduleSlots := make(map[models.MealSlot]models.MonthlyScheduleItem)
			for _, m := range monthlyAll {
				if m.DayOfMonth == targetDate.Day() {
					validScheduleSlots[m.Slot] = m
				}
			}

			plan, pErr := h.mealPlanRepo.GetOrCreateActivePlan(householdID, targetStr, targetStr)
			if pErr == nil && plan != nil {
				existingItems, _ := h.mealPlanRepo.GetItemsByDateRange(householdID, targetStr, targetStr)
				handledSlots := make(map[models.MealSlot]bool)
				for _, ti := range existingItems {
					m, inSchedule := validScheduleSlots[ti.Slot]
					if inSchedule && !handledSlots[ti.Slot] {
						handledSlots[ti.Slot] = true
						if ti.RecipeID != m.RecipeID || ti.IsSkipped != m.IsSkipped || ti.IsPrepared != m.IsPrepared || ti.Servings != m.Servings || ti.Notes != m.Notes {
							_ = h.mealPlanRepo.DB().Model(&models.MealPlanItem{}).Where("id = ?", ti.ID).Updates(map[string]interface{}{
								"recipe_id":   m.RecipeID,
								"is_skipped":  m.IsSkipped,
								"is_prepared": m.IsPrepared,
								"servings":    m.Servings,
								"notes":       m.Notes,
							})
						}
					} else {
						// Slot is NOT in this day's monthly schedule or is a duplicate: delete it
						_ = h.mealPlanRepo.DeleteItem(ti.ID)
					}
				}

				// Any remaining slot from schedule that doesn't exist yet: create it!
				for slot, m := range validScheduleSlots {
					if !handledSlots[slot] {
						newMeal := models.MealPlanItem{
							BaseModel:  models.BaseModel{ID: uuid.NewString()},
							MealPlanID: plan.ID,
							PlanDate:   targetStr,
							Slot:       m.Slot,
							RecipeID:   m.RecipeID,
							Servings:   m.Servings,
							IsSkipped:  m.IsSkipped,
							IsPrepared: m.IsPrepared,
							Notes:      m.Notes,
						}
						_ = h.mealPlanRepo.AddItem(&newMeal)
					}
				}
			}
		}
	}

	items, err := h.mealPlanRepo.GetItemsByDateRange(householdID, startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Enrich items
	for i := range items {
		if items[i].Recipe != nil {
			h.recipeServ.EnrichRecipe(items[i].Recipe)
			items[i].TotalCost = items[i].Recipe.TotalCost
			availCount := 0
			for _, ri := range items[i].Recipe.Ingredients {
				if !ri.IsMissing {
					availCount++
				}
			}
			items[i].AvailableCount = availCount
			items[i].TotalCount = len(items[i].Recipe.Ingredients)
		}
	}

	c.JSON(http.StatusOK, items)
}

func (h *AppHandler) AddMealPlanItem(c *gin.Context) {
	var item models.MealPlanItem
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	householdID := h.getHouseholdID(c)
	if item.MealPlanID == "" {
		plan, err := h.mealPlanRepo.GetOrCreateActivePlan(householdID, item.PlanDate, item.PlanDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		item.MealPlanID = plan.ID
	}

	// 1. Check if an item already exists on this day and slot (e.g. Lunch was already added)
	existingItem, _ := h.mealPlanRepo.GetItemByDateAndSlot(householdID, item.PlanDate, item.Slot)
	oldRecipeID := ""
	if existingItem != nil {
		oldRecipeID = existingItem.RecipeID
	}

	// 2. Monthly limit and future swap logic:
	// "وياخذ الاكله المضافه من اقرب يوم قادم ويضع مكانها الوجبه المستبدله (في حالة وصول عدد الوجبات من هذا الايتم للحد الاقصى خلال الشهر)"
	t, parseErr := time.Parse("2006-01-02", item.PlanDate)
	if parseErr == nil {
		startOfMonth := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.Local).Format("2006-01-02")
		endOfMonth := time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.Local).Format("2006-01-02")

		monthItems, _ := h.mealPlanRepo.GetItemsByDateRange(householdID, startOfMonth, endOfMonth)

		// Check recipe monthly limit
		rec, _ := h.recipeRepo.GetRecipeByID(item.RecipeID, householdID)
		maxDays := 4
		if rec != nil {
			maxDays = rec.Servings
		}
		if maxDays == 0 {
			recipeName := "هذه الأكلة"
			if rec != nil && rec.NameAr != "" {
				recipeName = rec.NameAr
			}
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "limit_reached",
				"message": fmt.Sprintf("أكلة '%s' غير متاحة للإضافة لأن عدد تكراراتها محدد بـ 0", recipeName),
			})
			return
		}

		usedDays := make(map[string]bool)
		for _, mi := range monthItems {
			if mi.RecipeID == item.RecipeID && !mi.IsSkipped {
				usedDays[mi.PlanDate] = true
			}
		}

		// If this day doesn't already have this recipe and it reached/exceeds max limit
		if !usedDays[item.PlanDate] && len(usedDays) >= maxDays {
			// Find nearest future day this month with this recipe
			var nearestFutureItem *models.MealPlanItem
			for i := range monthItems {
				if monthItems[i].RecipeID == item.RecipeID && monthItems[i].PlanDate > item.PlanDate {
					if nearestFutureItem == nil || monthItems[i].PlanDate < nearestFutureItem.PlanDate {
						nearestFutureItem = &monthItems[i]
					}
				}
			}

			if nearestFutureItem != nil {
				if oldRecipeID != "" && oldRecipeID != item.RecipeID {
					nearestFutureItem.RecipeID = oldRecipeID
					_ = h.mealPlanRepo.UpdateItem(nearestFutureItem)
				} else {
					_ = h.mealPlanRepo.DeleteItem(nearestFutureItem.ID)
				}
			}
		}
	}

	// 3. Save or Replace: "في حال كان مضاف سابقا يتم استبداله بالجديد"
	if existingItem != nil {
		existingItem.RecipeID = item.RecipeID
		if item.Notes != "" {
			existingItem.Notes = item.Notes
		}
		if item.Servings > 0 {
			existingItem.Servings = item.Servings
		}
		existingItem.IsPrepared = false
		if err := h.mealPlanRepo.UpdateItem(existingItem); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		item = *existingItem
	} else {
		if err := h.mealPlanRepo.AddItem(&item); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	created, _ := h.mealPlanRepo.GetItemByID(item.ID)
	if created != nil && created.Recipe != nil {
		h.recipeServ.EnrichRecipe(created.Recipe)
	}
	h.hub.Broadcast("meal_created")
	c.JSON(http.StatusCreated, created)
}

func (h *AppHandler) UpdateMealPlanItem(c *gin.Context) {
	id := c.Param("id")
	householdID := h.getHouseholdID(c)
	var item models.MealPlanItem
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item.ID = id

	existing, err := h.mealPlanRepo.GetItemByID(id)
	if err != nil || existing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "الوجبة غير موجودة"})
		return
	}

	// Preparation status is strictly governed by PrepareMeal and UnprepareMeal transactions.
	// Generic item updates must never alter or overwrite is_prepared.
	item.IsPrepared = existing.IsPrepared

	// If the meal is currently prepared, it cannot be skipped without unpreparing first
	if existing.IsPrepared && item.IsSkipped {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "already_prepared",
			"message": "لا يمكن تخطي وجبة تم تحضيرها بالفعل. يرجى التراجع عن التحضير أولاً.",
		})
		return
	}

	// Check if this is an UN-SKIP operation (was skipped and now is_skipped is false)
	if existing.IsSkipped && !item.IsSkipped {
		recipeID := item.RecipeID
		if recipeID == "" {
			recipeID = existing.RecipeID
		}
		rec, _ := h.recipeRepo.GetRecipeByID(recipeID, householdID)
		maxDays := 4
		if rec != nil {
			maxDays = rec.Servings
		}
		if maxDays == 0 {
			recipeName := "هذه الأكلة"
			if rec != nil && rec.NameAr != "" {
				recipeName = rec.NameAr
			}
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "limit_reached",
				"message": fmt.Sprintf("لا يمكن إلغاء التخطي: أكلة '%s' غير متاحة لأن عدد تكراراتها محدد بـ 0", recipeName),
			})
			return
		}

		allMonthly, _ := h.mealPlanRepo.GetMonthlySchedule(householdID)
		usedDays := make(map[int]bool)
		itemDay := 0
		if t, parseErr := time.Parse("2006-01-02", existing.PlanDate); parseErr == nil {
			itemDay = t.Day()
		}
		for _, m := range allMonthly {
			if m.RecipeID == recipeID && !m.IsSkipped {
				if !(m.DayOfMonth == itemDay && m.Slot == existing.Slot) {
					usedDays[m.DayOfMonth] = true
				}
			}
		}

		if len(usedDays) >= maxDays {
			recipeName := "هذه الأكلة"
			if rec != nil && rec.NameAr != "" {
				recipeName = rec.NameAr
			}
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "limit_reached",
				"message": fmt.Sprintf("لا يمكن إلغاء التخطي: تم استنفاد الحد الأقصى لاختيار '%s' لهذا الشهر (%d/%d أيام) في أيام أخرى", recipeName, len(usedDays), maxDays),
			})
			return
		}
	}

	// Update only valid mutable fields in database
	updates := map[string]interface{}{
		"is_skipped": item.IsSkipped,
	}
	if item.Servings > 0 {
		updates["servings"] = item.Servings
	}
	if item.RecipeID != "" {
		updates["recipe_id"] = item.RecipeID
	}
	if item.Slot != "" {
		updates["slot"] = item.Slot
	}
	if item.Notes != "" {
		updates["notes"] = item.Notes
	}

	if err := h.mealPlanRepo.DB().Model(&models.MealPlanItem{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Real-time synchronization of skip status with MonthlyScheduleItem
	if t, parseErr := time.Parse("2006-01-02", existing.PlanDate); parseErr == nil {
		h.mealPlanRepo.DB().Model(&models.MonthlyScheduleItem{}).
			Where("(household_id = ? OR household_id = '') AND day_of_month = ? AND slot = ?", householdID, t.Day(), existing.Slot).
			Update("is_skipped", item.IsSkipped)
	}

	updatedItem, _ := h.mealPlanRepo.GetItemByID(id)
	if updatedItem == nil {
		updatedItem = &item
	}

	h.hub.Broadcast("meal_updated")
	c.JSON(http.StatusOK, updatedItem)
}

func (h *AppHandler) DeleteMealPlanItem(c *gin.Context) {
	id := c.Param("id")
	if it, _ := h.mealPlanRepo.GetItemByID(id); it != nil {
		if it.IsPrepared || it.IsSkipped {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "locked_state",
				"message": "لا يمكن حذف الوجبة أثناء وجودها في حالة التحضير أو التخطي. يرجى التراجع أولاً.",
			})
			return
		}
	}
	if err := h.mealPlanRepo.DeleteItem(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("meal_deleted")
	c.JSON(http.StatusOK, gin.H{"message": "meal plan item deleted"})
}

func (h *AppHandler) SkipDay(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	var req struct {
		Date string `json:"date" binding:"required"`
		Skip bool   `json:"skip"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// If unskipping day, check all meals on this day to ensure none exceed monthly limit
	t, parseErr := time.Parse("2006-01-02", req.Date)
	if !req.Skip && parseErr == nil {
		allMonthly, _ := h.mealPlanRepo.GetMonthlySchedule(householdID)
		for _, m := range allMonthly {
			if m.DayOfMonth == t.Day() && m.IsSkipped {
				rec, _ := h.recipeRepo.GetRecipeByID(m.RecipeID, householdID)
				maxDays := 4
				if rec != nil {
					maxDays = rec.Servings
				}
				if maxDays == 0 {
					recipeName := "إحدى الأكلات"
					if rec != nil && rec.NameAr != "" {
						recipeName = rec.NameAr
					}
					c.JSON(http.StatusBadRequest, gin.H{
						"error":   "limit_reached",
						"message": fmt.Sprintf("لا يمكن إلغاء تخطي اليوم: أكلة '%s' غير متاحة لأن عدد تكراراتها محدد بـ 0", recipeName),
					})
					return
				}
				usedDays := make(map[int]bool)
				for _, other := range allMonthly {
					if other.RecipeID == m.RecipeID && !other.IsSkipped {
						if !(other.DayOfMonth == t.Day() && other.Slot == m.Slot) {
							usedDays[other.DayOfMonth] = true
						}
					}
				}
				if len(usedDays) >= maxDays {
					recipeName := "إحدى الأكلات"
					if rec != nil && rec.NameAr != "" {
						recipeName = rec.NameAr
					}
					c.JSON(http.StatusBadRequest, gin.H{
						"error":   "limit_reached",
						"message": fmt.Sprintf("لا يمكن إلغاء تخطي اليوم: تم استنفاد رصيد استخدام أكلة '%s' لهذا الشهر (%d/%d أيام) في أيام أخرى", recipeName, len(usedDays), maxDays),
					})
					return
				}
			}
		}
	}

	if err := h.mealPlanRepo.SkipDay(householdID, req.Date, req.Skip); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Real-time synchronization of day skip status with MonthlyScheduleItem
	if parseErr == nil {
		h.mealPlanRepo.DB().Model(&models.MonthlyScheduleItem{}).
			Where("(household_id = ? OR household_id = '') AND day_of_month = ?", householdID, t.Day()).
			Update("is_skipped", req.Skip)
	}

	h.hub.Broadcast("day_skipped")
	c.JSON(http.StatusOK, gin.H{"message": "day skip status updated"})
}

func (h *AppHandler) CopyWeek(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	var req struct {
		SourceStartDate string `json:"source_start_date" binding:"required"`
		TargetStartDate string `json:"target_start_date" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.mealPlanRepo.CopyWeekPlan(householdID, req.SourceStartDate, req.TargetStartDate); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("schedule_updated")
	c.JSON(http.StatusOK, gin.H{"message": "week plan copied successfully"})
}

// Monthly Recurring Schedule
func (h *AppHandler) GetMonthlySchedule(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	yearStr := c.Query("year")
	monthStr := c.Query("month")

	items, err := h.mealPlanRepo.GetMonthlySchedule(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for i := range items {
		if items[i].Recipe != nil {
			h.recipeServ.EnrichRecipe(items[i].Recipe)
		}
	}

	if yearStr != "" && monthStr != "" {
		year, _ := strconv.Atoi(yearStr)
		month, _ := strconv.Atoi(monthStr)
		if year > 2000 && month >= 1 && month <= 12 {
			daysInMonth := time.Date(year, time.Month(month+1), 0, 0, 0, 0, 0, time.Local).Day()
			c.JSON(http.StatusOK, gin.H{
				"year":          year,
				"month":         month,
				"days_in_month": daysInMonth,
				"items":         items,
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
	})
}

func (h *AppHandler) SaveMonthlyScheduleItem(c *gin.Context) {
	var item models.MonthlyScheduleItem
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if item.HouseholdID == "" {
		item.HouseholdID = h.getHouseholdID(c)
	}
	if item.DayOfMonth < 1 || item.DayOfMonth > 31 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "day_of_month must be between 1 and 31"})
		return
	}

	// 1. Check existing item in this day and slot (replace if exists)
	allMonthly, _ := h.mealPlanRepo.GetMonthlySchedule(item.HouseholdID)
	oldRecipeID := ""
	wasSkipped := false
	for _, m := range allMonthly {
		if m.DayOfMonth == item.DayOfMonth && m.Slot == item.Slot {
			oldRecipeID = m.RecipeID
			wasSkipped = m.IsSkipped
			break
		}
	}

	// 2. Check recipe monthly limit and future swap
	rec, _ := h.recipeRepo.GetRecipeByID(item.RecipeID, item.HouseholdID)
	maxDays := 4
	if rec != nil {
		maxDays = rec.Servings
	}
	if maxDays == 0 {
		recipeName := "هذه الأكلة"
		if rec != nil && rec.NameAr != "" {
			recipeName = rec.NameAr
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "limit_reached",
			"message": fmt.Sprintf("أكلة '%s' غير متاحة للإضافة في جدول الشهر لأن عدد تكراراتها محدد بـ 0", recipeName),
		})
		return
	}

	usedDays := make(map[int]bool)
	for _, m := range allMonthly {
		if m.RecipeID == item.RecipeID && !m.IsSkipped {
			// Don't count the current item slot if it's already there
			if !(m.DayOfMonth == item.DayOfMonth && m.Slot == item.Slot) {
				usedDays[m.DayOfMonth] = true
			}
		}
	}

	// If this is an UN-SKIP operation (was skipped and now is_skipped is false) for the same recipe:
	if wasSkipped && !item.IsSkipped && (oldRecipeID == item.RecipeID || oldRecipeID == "") {
		if len(usedDays) >= maxDays {
			recipeName := "هذه الأكلة"
			if rec != nil && rec.NameAr != "" {
				recipeName = rec.NameAr
			}
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "limit_reached",
				"message": fmt.Sprintf("لا يمكن إلغاء التخطي: تم استنفاد الحد الأقصى لاختيار '%s' لهذا الشهر (%d/%d أيام) في أيام أخرى", recipeName, len(usedDays), maxDays),
			})
			return
		}
	}

	// If day doesn't already have this recipe and it reached/exceeded max limit
	if !item.IsSkipped && !usedDays[item.DayOfMonth] && len(usedDays) >= maxDays {
		var nearestFuture *models.MonthlyScheduleItem
		for i := range allMonthly {
			if allMonthly[i].RecipeID == item.RecipeID && allMonthly[i].DayOfMonth > item.DayOfMonth && !allMonthly[i].IsSkipped {
				if nearestFuture == nil || allMonthly[i].DayOfMonth < nearestFuture.DayOfMonth {
					nearestFuture = &allMonthly[i]
				}
			}
		}

		if nearestFuture != nil {
			if oldRecipeID != "" && oldRecipeID != item.RecipeID {
				nearestFuture.RecipeID = oldRecipeID
				_ = h.mealPlanRepo.SaveMonthlyScheduleItem(nearestFuture)
			} else {
				_ = h.mealPlanRepo.DeleteMonthlyScheduleItem(nearestFuture.ID)
			}
		} else {
			recipeName := "هذه الأكلة"
			if rec != nil && rec.NameAr != "" {
				recipeName = rec.NameAr
			}
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "limit_reached",
				"message": fmt.Sprintf("وصلت أكلة '%s' للحد الأقصى المسموح لاختيارها هذا الشهر (%d أيام) ولا توجد أيام قادمة لاستبدالها", recipeName, maxDays),
			})
			return
		}
	}

	// Mutual exclusivity: a meal cannot be both prepared and skipped
	if item.IsPrepared {
		item.IsSkipped = false
	} else if item.IsSkipped {
		item.IsPrepared = false
	}

	if err := h.mealPlanRepo.SaveMonthlyScheduleItem(&item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Real-time synchronization to HomeTab:
	// If the modified item is for today's day of the month, immediately sync it with today's MealPlanItem!
	now := time.Now()
	if item.DayOfMonth == now.Day() {
		todayStr := now.Format("2006-01-02")
		plan, pErr := h.mealPlanRepo.GetOrCreateActivePlan(item.HouseholdID, todayStr, todayStr)
		if pErr == nil && plan != nil {
			// Clear any duplicate or existing items for this slot on today and recreate it cleanly
			_ = h.mealPlanRepo.DB().Where("meal_plan_id = ? AND plan_date = ? AND slot = ?", plan.ID, todayStr, item.Slot).Delete(&models.MealPlanItem{})
			newMealItem := models.MealPlanItem{
				BaseModel:  models.BaseModel{ID: uuid.NewString()},
				MealPlanID: plan.ID,
				PlanDate:   todayStr,
				Slot:       item.Slot,
				RecipeID:   item.RecipeID,
				Servings:   item.Servings,
				IsSkipped:  item.IsSkipped,
				IsPrepared: item.IsPrepared,
				Notes:      item.Notes,
			}
			_ = h.mealPlanRepo.AddItem(&newMealItem)
		}
	}

	h.hub.Broadcast("schedule_updated")
	c.JSON(http.StatusOK, item)
}

func (h *AppHandler) DeleteMonthlyScheduleItem(c *gin.Context) {
	id := c.Param("id")

	// Prevent deleting item if it is prepared or skipped
	var mItem models.MonthlyScheduleItem
	if err := h.mealPlanRepo.DB().Where("id = ?", id).First(&mItem).Error; err == nil {
		if mItem.IsPrepared || mItem.IsSkipped {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "locked_state",
				"message": "لا يمكن حذف الوجبة أثناء وجودها في حالة التحضير أو التخطي. يرجى التراجع أولاً.",
			})
			return
		}

		now := time.Now()
		if mItem.DayOfMonth == now.Day() {
			todayStr := now.Format("2006-01-02")
			_ = h.mealPlanRepo.DB().Where("plan_date = ? AND slot = ?", todayStr, mItem.Slot).Delete(&models.MealPlanItem{})
		}
	}

	if err := h.mealPlanRepo.DeleteMonthlyScheduleItem(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.Broadcast("schedule_updated")
	c.JSON(http.StatusOK, gin.H{"message": "monthly schedule item deleted"})
}

// AutoDistributeMonthlySchedule randomly and evenly distributes available recipes across the month for a single slot,
// respecting each recipe's monthly repetition limit (servings) and avoiding back-to-back repeats.
func (h *AppHandler) AutoDistributeMonthlySchedule(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	var req struct {
		Slot    models.MealSlot `json:"slot" binding:"required"`
		Year    int             `json:"year"`
		Month   int             `json:"month"`
		GroupID string          `json:"group_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	if req.Year <= 2000 {
		req.Year = now.Year()
	}
	if req.Month < 1 || req.Month > 12 {
		req.Month = int(now.Month())
	}
	daysInMonth := time.Date(req.Year, time.Month(req.Month+1), 0, 0, 0, 0, 0, time.Local).Day()

	recipes, err := h.recipeRepo.GetAllRecipes(householdID, req.GroupID, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	allMonthly, err := h.mealPlanRepo.GetMonthlySchedule(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 1. Preserve days in this slot that are already prepared; track usage in other slots & prepared days
	preparedDays := make(map[int]bool)
	usedDaysByRecipe := make(map[string]map[int]bool)
	for _, m := range allMonthly {
		if m.Slot == req.Slot {
			if m.IsPrepared {
				preparedDays[m.DayOfMonth] = true
				if !m.IsSkipped {
					if usedDaysByRecipe[m.RecipeID] == nil {
						usedDaysByRecipe[m.RecipeID] = make(map[int]bool)
					}
					usedDaysByRecipe[m.RecipeID][m.DayOfMonth] = true
				}
			}
		} else if !m.IsSkipped {
			if usedDaysByRecipe[m.RecipeID] == nil {
				usedDaysByRecipe[m.RecipeID] = make(map[int]bool)
			}
			usedDaysByRecipe[m.RecipeID][m.DayOfMonth] = true
		}
	}

	var availableDays []int
	for d := 1; d <= daysInMonth; d++ {
		if !preparedDays[d] {
			availableDays = append(availableDays, d)
		}
	}

	// 2. Build candidate list filtered by the selected meal slot & remaining monthly quota
	matchesSlot := func(r models.Recipe, slot models.MealSlot) bool {
		switch slot {
		case models.MealBreakfast:
			return r.ForBreakfast
		case models.MealLunch:
			return r.ForLunch
		case models.MealDinner:
			return r.ForDinner
		case models.MealSnack:
			return r.ForSnack
		default:
			return false
		}
	}

	type candidate struct {
		recipe models.Recipe
		quota  int
	}
	var candidates []candidate
	for _, r := range recipes {
		if r.Servings <= 0 || !matchesSlot(r, req.Slot) {
			continue
		}
		used := len(usedDaysByRecipe[r.ID])
		rem := r.Servings - used
		if rem > 0 {
			candidates = append(candidates, candidate{recipe: r, quota: rem})
		}
	}

	if len(candidates) == 0 || len(availableDays) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "no_candidates",
			"message": "لا توجد وصفات محددة لهذه الوجبة (تأكد من تفعيل خيار الوجبة ووجود تكرارات أكبر من 0)",
		})
		return
	}

	// Randomize order first, then stable-sort highest quota first so high-frequency recipes get clean even spacing
	rand.Shuffle(len(candidates), func(i, j int) {
		candidates[i], candidates[j] = candidates[j], candidates[i]
	})
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].quota > candidates[j].quota
	})

	// 3. Even-spacing randomized placement
	assigned := make(map[int]models.Recipe)
	totalAvailable := len(availableDays)

	hasAdjacentSame := func(day int, recipeID string) bool {
		if prev, ok := assigned[day-1]; ok && prev.ID == recipeID {
			return true
		}
		if next, ok := assigned[day+1]; ok && next.ID == recipeID {
			return true
		}
		return false
	}

	for _, cand := range candidates {
		if len(assigned) >= totalAvailable {
			break
		}
		// Cap placements to remaining unassigned days
		remainingSlots := totalAvailable - len(assigned)
		count := cand.quota
		if count > remainingSlots {
			count = remainingSlots
		}
		if count <= 0 {
			continue
		}

		stride := float64(totalAvailable) / float64(count)
		phase := rand.Float64() * stride

		for j := 0; j < count; j++ {
			if len(assigned) >= totalAvailable {
				break
			}
			idealIdx := int(math.Round(phase+float64(j)*stride)) % totalAvailable
			if idealIdx < 0 {
				idealIdx += totalAvailable
			}

			// First pass: find closest free day that avoids adjacent duplicate (d-1 or d+1) and isn't already used by this recipe
			chosenDay := -1
			for offset := 0; offset < totalAvailable; offset++ {
				for _, sign := range []int{1, -1} {
					if offset == 0 && sign == -1 {
						continue
					}
					idx := (idealIdx + sign*offset) % totalAvailable
					if idx < 0 {
						idx += totalAvailable
					}
					d := availableDays[idx]
					if _, taken := assigned[d]; taken {
						continue
					}
					if usedDaysByRecipe[cand.recipe.ID][d] {
						continue
					}
					if !hasAdjacentSame(d, cand.recipe.ID) {
						chosenDay = d
						break
					}
				}
				if chosenDay != -1 {
					break
				}
			}

			// Fallback pass: any free day not exceeding this day
			if chosenDay == -1 {
				for offset := 0; offset < totalAvailable; offset++ {
					for _, sign := range []int{1, -1} {
						if offset == 0 && sign == -1 {
							continue
						}
						idx := (idealIdx + sign*offset) % totalAvailable
						if idx < 0 {
							idx += totalAvailable
						}
						d := availableDays[idx]
						if _, taken := assigned[d]; !taken {
							chosenDay = d
							break
						}
					}
					if chosenDay != -1 {
						break
					}
				}
			}

			if chosenDay != -1 {
				assigned[chosenDay] = cand.recipe
				if usedDaysByRecipe[cand.recipe.ID] == nil {
					usedDaysByRecipe[cand.recipe.ID] = make(map[int]bool)
				}
				usedDaysByRecipe[cand.recipe.ID][chosenDay] = true
			}
		}
	}

	// 4. Persist inside a single atomic transaction
	err = h.mealPlanRepo.DB().Transaction(func(tx *gorm.DB) error {
		// Remove old non-prepared items in this slot
		if err := tx.Unscoped().
			Where("(household_id = ? OR household_id = '') AND slot = ? AND is_prepared = ?", householdID, req.Slot, false).
			Delete(&models.MonthlyScheduleItem{}).Error; err != nil {
			return err
		}

		// Insert newly distributed items
		for day, rec := range assigned {
			newItem := models.MonthlyScheduleItem{
				BaseModel:   models.BaseModel{ID: uuid.NewString()},
				HouseholdID: householdID,
				DayOfMonth:  day,
				Slot:        req.Slot,
				RecipeID:    rec.ID,
				Servings:    rec.Servings,
				IsSkipped:   false,
				IsPrepared:  false,
			}
			if err := tx.Create(&newItem).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	updatedAll, _ := h.mealPlanRepo.GetMonthlySchedule(householdID)
	for i := range updatedAll {
		if updatedAll[i].Recipe != nil {
			h.recipeServ.EnrichRecipe(updatedAll[i].Recipe)
		}
	}

	h.hub.Broadcast("schedule_updated")
	c.JSON(http.StatusOK, gin.H{
		"assigned_count": len(assigned),
		"items":          updatedAll,
	})
}

// Prepare Meal - Critical Inventory Transaction
func (h *AppHandler) PrepareMeal(c *gin.Context) {
	var req services.PrepareMealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.HouseholdID == "" {
		req.HouseholdID = h.getHouseholdID(c)
	}

	resp, err := h.prepServ.PrepareMeal(&req)
	if err != nil {
		if missingErr, ok := err.(*services.InsufficientStockError); ok {
			c.JSON(http.StatusConflict, gin.H{
				"error":         "insufficient_stock",
				"message":       "لا يمكن تحضير الوجبة: الكميات المتوفرة في المخزن غير كافية لبعض المكونات",
				"missing_items": missingErr.MissingItems,
			})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Real-time synchronization of preparation status with MonthlyScheduleItem
	if item, _ := h.mealPlanRepo.GetItemByID(req.MealPlanItemID); item != nil {
		if t, parseErr := time.Parse("2006-01-02", item.PlanDate); parseErr == nil {
			h.mealPlanRepo.DB().Model(&models.MonthlyScheduleItem{}).
				Where("(household_id = ? OR household_id = '') AND day_of_month = ? AND slot = ?", req.HouseholdID, t.Day(), item.Slot).
				Update("is_prepared", true)
		}
	}

	h.hub.Broadcast("meal_prepared")
	c.JSON(http.StatusOK, resp)
}

func (h *AppHandler) UnprepareMeal(c *gin.Context) {
	var req services.UnprepareMealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.HouseholdID == "" {
		req.HouseholdID = h.getHouseholdID(c)
	}

	resp, err := h.prepServ.UnprepareMeal(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Real-time synchronization of preparation status with MonthlyScheduleItem
	if item, _ := h.mealPlanRepo.GetItemByID(req.MealPlanItemID); item != nil {
		if t, parseErr := time.Parse("2006-01-02", item.PlanDate); parseErr == nil {
			h.mealPlanRepo.DB().Model(&models.MonthlyScheduleItem{}).
				Where("(household_id = ? OR household_id = '') AND day_of_month = ? AND slot = ?", req.HouseholdID, t.Day(), item.Slot).
				Update("is_prepared", false)
		}
	}

	h.hub.Broadcast("meal_unprepared")
	c.JSON(http.StatusOK, resp)
}

// Shopping Lists
func (h *AppHandler) GetActiveShoppingList(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	list, err := h.shopRepo.GetOrCreateActiveList(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var totalEst, totalAct float64
	for _, it := range list.Items {
		totalEst += it.EstimatedPrice
		if it.IsBought {
			totalAct += it.ActualPrice
		}
	}
	list.TotalEstCost = totalEst
	list.TotalActCost = totalAct

	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) GenerateSmartShoppingList(c *gin.Context) {
	var req services.GenerateSmartListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.HouseholdID == "" {
		req.HouseholdID = h.getHouseholdID(c)
	}

	list, err := h.shopServ.GenerateSmartList(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) AddShoppingItem(c *gin.Context) {
	var item models.ShoppingItem
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if item.ID == "" {
		item.ID = uuid.NewString()
	}
	if err := h.shopRepo.AddItem(&item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *AppHandler) MarkShoppingItemBought(c *gin.Context) {
	var req services.MarkItemBoughtRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.HouseholdID == "" {
		req.HouseholdID = h.getHouseholdID(c)
	}

	if err := h.shopServ.MarkItemBought(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "item bought and inventory updated"})
}

func (h *AppHandler) DeleteShoppingItem(c *gin.Context) {
	id := c.Param("id")
	if err := h.shopRepo.DeleteItem(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "shopping item deleted"})
}

func (h *AppHandler) GetPurchases(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	purchases, err := h.shopRepo.GetAllPurchases(householdID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, purchases)
}

// Sync
func (h *AppHandler) SyncBatch(c *gin.Context) {
	var batch services.SyncBatchRequest
	if err := c.ShouldBindJSON(&batch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if batch.HouseholdID == "" {
		batch.HouseholdID = h.getHouseholdID(c)
	}

	resp, err := h.syncServ.ProcessSyncBatch(&batch)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Settings
func (h *AppHandler) GetSettings(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	settings, err := h.syncRepo.GetSettings(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AppHandler) SetSetting(c *gin.Context) {
	var setting models.Setting
	if err := c.ShouldBindJSON(&setting); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if setting.ID == "" {
		setting.ID = uuid.NewString()
	}
	if setting.HouseholdID == "" {
		setting.HouseholdID = h.getHouseholdID(c)
	}
	if err := h.syncRepo.SetSetting(&setting); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, setting)
}

// Excel Export / Import
func (h *AppHandler) ExportIngredientsExcel(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	data, err := h.excelServ.ExportIngredients(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename=bayti_ingredients.xlsx")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
}

func (h *AppHandler) ExportRecipesExcel(c *gin.Context) {
	householdID := h.getHouseholdID(c)
	data, err := h.excelServ.ExportRecipes(householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename=bayti_recipes.xlsx")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
}

func (h *AppHandler) PreviewImportIngredientsExcel(c *gin.Context) {
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	householdID := c.DefaultPostForm("household_id", "default")
	preview, err := h.excelServ.PreviewImportIngredients(householdID, file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, preview)
}

func (h *AppHandler) CommitImportIngredientsExcel(c *gin.Context) {
	var req struct {
		HouseholdID string                                   `json:"household_id"`
		Items       []services.IngredientImportPreviewItem `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.HouseholdID == "" {
		req.HouseholdID = h.getHouseholdID(c)
	}

	count, err := h.excelServ.ImportIngredients(req.HouseholdID, req.Items)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.hub.Broadcast("data_imported")
	c.JSON(http.StatusOK, gin.H{
		"message":        fmt.Sprintf("تم استيراد وتحديث %d مكون بنجاح", count),
		"imported_count": count,
	})
}

// ResetSystem wipes all operational and transactional data (groups, ingredients, recipes, schedules, transactions)
// leaving only base units and an empty, clean system. Requires secret PIN 1611.
func (h *AppHandler) ResetSystem(c *gin.Context) {
	var req struct {
		PIN string `json:"pin" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.PIN) != "1611" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "الرمز السري غير صحيح"})
		return
	}

	householdID := h.getHouseholdID(c)

	db := h.invRepo.DB()
	err := db.Transaction(func(tx *gorm.DB) error {
		// 1. Delete child tables where parent belongs to this household
		recipeFilter := "recipe_id IN (SELECT id FROM recipes WHERE household_id = ?)"
		mealPlanFilter := "meal_plan_id IN (SELECT id FROM meal_plans WHERE household_id = ?)"
		shoppingFilter := "shopping_list_id IN (SELECT id FROM shopping_lists WHERE household_id = ?)"
		purchaseFilter := "purchase_id IN (SELECT id FROM purchases WHERE household_id = ?)"
		if householdID == "default" {
			recipeFilter = "recipe_id IN (SELECT id FROM recipes WHERE household_id = ? OR household_id = '')"
			mealPlanFilter = "meal_plan_id IN (SELECT id FROM meal_plans WHERE household_id = ? OR household_id = '')"
			shoppingFilter = "shopping_list_id IN (SELECT id FROM shopping_lists WHERE household_id = ? OR household_id = '')"
			purchaseFilter = "purchase_id IN (SELECT id FROM purchases WHERE household_id = ? OR household_id = '')"
		}

		if err := tx.Unscoped().Where(recipeFilter, householdID).Delete(&models.RecipeIngredient{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where(mealPlanFilter, householdID).Delete(&models.MealPlanItem{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where(shoppingFilter, householdID).Delete(&models.ShoppingItem{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where(purchaseFilter, householdID).Delete(&models.PurchaseItem{}).Error; err != nil {
			return err
		}

		// 2. Delete tables with household_id directly
		directTables := []interface{}{
			&models.MealPreparation{},
			&models.MealPlan{},
			&models.MonthlyScheduleItem{},
			&models.ShoppingList{},
			&models.Purchase{},
			&models.InventoryTransaction{},
			&models.Inventory{},
			&models.Recipe{},
			&models.RecipeGroup{},
			&models.Ingredient{},
			&models.IngredientGroup{},
			&models.SyncOperation{},
			&models.Setting{},
		}
		for _, table := range directTables {
			query := "household_id = ?"
			args := []interface{}{householdID}
			if householdID == "default" {
				query = "household_id = ? OR household_id = ''"
			}
			if err := tx.Unscoped().Where(query, args...).Delete(table).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل تصفير النظام: " + err.Error()})
		return
	}

	h.hub.Broadcast("system_reset")
	c.JSON(http.StatusOK, gin.H{"message": "تم تصفير النظام بالكامل بنجاح"})
}
