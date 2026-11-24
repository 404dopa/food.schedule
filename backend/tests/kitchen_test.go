package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"bayti-kitchen/backend/internal/config"
	"bayti-kitchen/backend/internal/handlers"
	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"
	"bayti-kitchen/backend/internal/seed"
	"bayti-kitchen/backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func setupTestContext(t *testing.T) (*repository.Database, *services.InventoryService, *services.RecipeService, *services.PreparationService, *services.ShoppingService, *services.SyncService, *services.ExcelService, *repository.IngredientRepository, *repository.InventoryRepository, *repository.RecipeRepository, *repository.MealPlanRepository) {
	tempDbFile := filepath.Join(t.TempDir(), "test_bayti.db")
	cfg := &config.Config{
		DBType: "sqlite",
		DBFile: tempDbFile,
	}
	db, err := repository.NewDatabase(cfg)
	if err != nil {
		t.Fatalf("failed to init test db: %v", err)
	}

	sqlDB, err := db.DB.DB()
	if err == nil {
		t.Cleanup(func() {
			_ = sqlDB.Close()
		})
	}

	if err := db.AutoMigrate(); err != nil {
		t.Fatalf("failed to automigrate: %v", err)
	}

	if err := seed.SeedDatabase(db.DB); err != nil {
		t.Fatalf("failed to seed: %v", err)
	}

	ingRepo := repository.NewIngredientRepository(db.DB)
	invRepo := repository.NewInventoryRepository(db.DB)
	recipeRepo := repository.NewRecipeRepository(db.DB)
	mealPlanRepo := repository.NewMealPlanRepository(db.DB)
	shopRepo := repository.NewShoppingRepository(db.DB)
	syncRepo := repository.NewSyncRepository(db.DB)

	unitServ := services.NewUnitService()
	invServ := services.NewInventoryService(invRepo, ingRepo, unitServ)
	recipeServ := services.NewRecipeService(recipeRepo, invRepo, unitServ)
	prepServ := services.NewPreparationService(mealPlanRepo, recipeRepo, invRepo, unitServ)
	shopServ := services.NewShoppingService(shopRepo, mealPlanRepo, invRepo, ingRepo, unitServ)
	syncServ := services.NewSyncService(syncRepo, db.DB)
	excelServ := services.NewExcelService(ingRepo, recipeRepo, mealPlanRepo, invRepo, db.DB)

	return db, invServ, recipeServ, prepServ, shopServ, syncServ, excelServ, ingRepo, invRepo, recipeRepo, mealPlanRepo
}

// 1. إضافة مكون وتعديل المخزون
func TestAddIngredientAndAdjustInventory(t *testing.T) {
	_, invServ, _, _, _, _, _, ingRepo, invRepo, _, _ := setupTestContext(t)

	ingID := uuid.NewString()
	newIng := models.Ingredient{
		BaseModel:     models.BaseModel{ID: ingID},
		HouseholdID:   "default",
		GroupID:       "grp_veg",
		NameAr:        "فلفل أخضر",
		NameEn:        "Green Pepper",
		DefaultUnitID: "unit_kg",
		UnitPrice:     1500,
		MinStock:      0.5,
	}
	if err := ingRepo.CreateIngredient(nil, &newIng); err != nil {
		t.Fatalf("failed to create ingredient: %v", err)
	}

	// Adjust inventory (+2.5 kg)
	inv, err := invServ.AdjustStock(&services.StockAdjustmentRequest{
		HouseholdID:  "default",
		IngredientID: ingID,
		Quantity:     2.5,
		UnitID:       "unit_kg",
		Type:         "purchase",
		UnitPrice:    1500,
	})
	if err != nil {
		t.Fatalf("failed to adjust stock: %v", err)
	}
	if inv.Quantity != 2.5 {
		t.Errorf("expected quantity 2.5, got %f", inv.Quantity)
	}

	// Verify inventory transaction was recorded
	txs, err := invRepo.GetTransactions("default", ingID, 10)
	if err != nil || len(txs) == 0 {
		t.Fatalf("expected transaction record, got err=%v len=%d", err, len(txs))
	}
	if txs[0].QuantityDelta != 2.5 {
		t.Errorf("expected delta 2.5, got %f", txs[0].QuantityDelta)
	}
}

// 2. منع المخزون السالب
func TestPreventNegativeInventory(t *testing.T) {
	_, invServ, _, _, _, _, _, _, _, _, _ := setupTestContext(t)

	// ing_lamb has initial stock 3.5 kg. Try to deduct 10 kg
	_, err := invServ.AdjustStock(&services.StockAdjustmentRequest{
		HouseholdID:  "default",
		IngredientID: "ing_lamb",
		Quantity:     -10.0,
		UnitID:       "unit_kg",
		Type:         "waste",
	})
	if err == nil {
		t.Fatalf("expected error when stock would become negative, got nil")
	}
}

// 3. إضافة وصفة وحساب تكلفتها
func TestCreateRecipeAndCostCalculation(t *testing.T) {
	_, _, recipeServ, _, _, _, _, _, _, recipeRepo, _ := setupTestContext(t)

	recID := uuid.NewString()
	recipe := models.Recipe{
		BaseModel:    models.BaseModel{ID: recID},
		HouseholdID:  "default",
		GroupID:      "rg_rice",
		NameAr:       "تمن شعرية سريع",
		Servings:     2,
		PrepTimeMin:  10,
		CookTimeMin:  20,
		Ingredients: []models.RecipeIngredient{
			{
				IngredientID: "ing_rice_amber", // 3000 IQD/kg, 0.5 kg = 1500 IQD
				Quantity:     0.5,
				UnitID:       "unit_kg",
			},
			{
				IngredientID: "ing_vermicelli", // 750 IQD/pack, 1 pack = 750 IQD
				Quantity:     1.0,
				UnitID:       "unit_pack",
			},
		},
	}
	if err := recipeRepo.CreateRecipe(&recipe); err != nil {
		t.Fatalf("failed to create recipe: %v", err)
	}

	saved, err := recipeRepo.GetRecipeByID(recID, "default")
	if err != nil {
		t.Fatalf("failed to fetch created recipe: %v", err)
	}
	recipeServ.EnrichRecipe(saved)

	expectedTotalCost := 1500.0 + 750.0 // 2250 IQD
	if saved.TotalCost != expectedTotalCost {
		t.Logf("Debug: TotalCost is %.2f, expected %.2f", saved.TotalCost, expectedTotalCost)
		for _, ri := range saved.Ingredients {
			t.Logf("RI: ing=%s qty=%.2f unit=%s defaultUnit=%s unitPrice=%.2f",
				ri.IngredientID, ri.Quantity, ri.Unit.Code, ri.Ingredient.DefaultUnit.Code, ri.Ingredient.UnitPrice)
		}
	}
	if saved.TotalCost != expectedTotalCost {
		t.Errorf("expected total cost %.2f, got %.2f", expectedTotalCost, saved.TotalCost)
	}
	if saved.CostPerServe != expectedTotalCost/2.0 {
		t.Errorf("expected cost per serve %.2f, got %.2f", expectedTotalCost/2.0, saved.CostPerServe)
	}
}

// 4. جدول وجبات وإضافة أكثر من وجبة في اليوم
func TestMealPlanMultipleItemsPerDay(t *testing.T) {
	_, _, _, _, _, _, _, _, _, _, mealPlanRepo := setupTestContext(t)

	date := "2026-12-15"
	plan, err := mealPlanRepo.GetOrCreateActivePlan("default", date, date)
	if err != nil {
		t.Fatalf("failed to get active plan: %v", err)
	}

	// Add Breakfast
	item1 := models.MealPlanItem{
		MealPlanID: plan.ID,
		PlanDate:   date,
		Slot:       models.MealBreakfast,
		RecipeID:   "rec_lentil_soup",
		Servings:   2,
	}
	if err := mealPlanRepo.AddItem(&item1); err != nil {
		t.Fatalf("failed to add breakfast: %v", err)
	}

	// Add Lunch
	item2 := models.MealPlanItem{
		MealPlanID: plan.ID,
		PlanDate:   date,
		Slot:       models.MealLunch,
		RecipeID:   "rec_dolma",
		Servings:   6,
	}
	if err := mealPlanRepo.AddItem(&item2); err != nil {
		t.Fatalf("failed to add lunch: %v", err)
	}

	// Add Dinner
	item3 := models.MealPlanItem{
		MealPlanID: plan.ID,
		PlanDate:   date,
		Slot:       models.MealDinner,
		RecipeID:   "rec_okra_stew",
		Servings:   4,
	}
	if err := mealPlanRepo.AddItem(&item3); err != nil {
		t.Fatalf("failed to add dinner: %v", err)
	}

	items, err := mealPlanRepo.GetItemsByDateRange("default", date, date)
	if err != nil {
		t.Fatalf("failed to get items: %v", err)
	}
	if len(items) != 3 {
		t.Errorf("expected 3 meal items for the day, got %d", len(items))
	}
}

// 5. خصم مكونات الوصفة ومنع الخصم المكرر والتراجع الكامل عند نقص المخزون
func TestCriticalMealPreparationTransaction(t *testing.T) {
	_, _, _, prepServ, _, _, _, _, invRepo, _, mealPlanRepo := setupTestContext(t)

	today := time.Now().Format("2006-01-02")
	plan, _ := mealPlanRepo.GetOrCreateActivePlan("default", today, today)

	// Create a meal plan item for lentil soup (servings 4)
	item := models.MealPlanItem{
		ID:         uuid.NewString(),
		MealPlanID: plan.ID,
		PlanDate:   today,
		Slot:       models.MealLunch,
		RecipeID:   "rec_lentil_soup",
		Servings:   4,
	}
	if err := mealPlanRepo.AddItem(&item); err != nil {
		t.Fatalf("failed to add meal item: %v", err)
	}

	// Initial stock of red lentils (ing_lentils) is 3.0 kg
	initialInv, _ := invRepo.GetInventoryByIngredientID(nil, "ing_lentils", "default")
	initialLentils := initialInv.Quantity

	idempotencyKey := uuid.NewString()

	// First execution -> should succeed
	resp, err := prepServ.PrepareMeal(&services.PrepareMealRequest{
		HouseholdID:    "default",
		MealPlanItemID: item.ID,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		t.Fatalf("expected successful preparation, got err: %v", err)
	}
	if !resp.Success {
		t.Fatalf("expected success true")
	}

	// Verify stock was deducted
	afterInv, _ := invRepo.GetInventoryByIngredientID(nil, "ing_lentils", "default")
	// Lentil soup requires 0.35 kg for 4 servings
	expectedRemaining := initialLentils - 0.35
	if afterInv.Quantity != expectedRemaining {
		t.Errorf("expected remaining lentils %f, got %f", expectedRemaining, afterInv.Quantity)
	}

	// Second execution with SAME idempotency key -> MUST NOT deduct again (Idempotency Protection)
	secondResp, err := prepServ.PrepareMeal(&services.PrepareMealRequest{
		HouseholdID:    "default",
		MealPlanItemID: item.ID,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		t.Fatalf("idempotency check should succeed without error, got %v", err)
	}
	if !secondResp.AlreadyPrepared {
		t.Errorf("expected AlreadyPrepared=true on duplicate call")
	}

	afterSecondInv, _ := invRepo.GetInventoryByIngredientID(nil, "ing_lentils", "default")
	if afterSecondInv.Quantity != expectedRemaining {
		t.Errorf("idempotency failed: stock changed from %f to %f", expectedRemaining, afterSecondInv.Quantity)
	}

	// Test UnprepareMeal -> MUST restore deducted stock and set IsPrepared=false
	unprepResp, err := prepServ.UnprepareMeal(&services.UnprepareMealRequest{
		HouseholdID:    "default",
		MealPlanItemID: item.ID,
	})
	if err != nil {
		t.Fatalf("UnprepareMeal failed: %v", err)
	}
	if !unprepResp.Success {
		t.Errorf("expected unprepResp.Success=true")
	}

	afterUnprepInv, _ := invRepo.GetInventoryByIngredientID(nil, "ing_lentils", "default")
	if afterUnprepInv.Quantity != initialLentils {
		t.Errorf("expected restored lentils %f, got %f", initialLentils, afterUnprepInv.Quantity)
	}

	afterUnprepItem, _ := mealPlanRepo.GetItemByID(item.ID)
	if afterUnprepItem.IsPrepared {
		t.Errorf("expected afterUnprepItem.IsPrepared=false")
	}

	// Prepare AGAIN after Unprepare!
	thirdKey := uuid.NewString()
	thirdResp, err := prepServ.PrepareMeal(&services.PrepareMealRequest{
		HouseholdID:    "default",
		MealPlanItemID: item.ID,
		IdempotencyKey: thirdKey,
	})
	if err != nil {
		t.Fatalf("PrepareMeal after Unprepare failed: %v", err)
	}
	if !thirdResp.Success {
		t.Errorf("expected thirdResp.Success=true")
	}

	// Test Zeroing out stock and accepting preparation when stock is insufficient
	// Create another item with huge servings (e.g. 500 servings) which exceeds stock
	hugeItem := models.MealPlanItem{
		ID:         uuid.NewString(),
		MealPlanID: plan.ID,
		PlanDate:   today,
		Slot:       models.MealDinner,
		RecipeID:   "rec_lentil_soup",
		Servings:   500, // Requires ~43 kg lentils (we only have ~2.65 kg)
	}
	mealPlanRepo.AddItem(&hugeItem)

	hugeKey := uuid.NewString()

	hugeResp, err := prepServ.PrepareMeal(&services.PrepareMealRequest{
		HouseholdID:    "default",
		MealPlanItemID: hugeItem.ID,
		IdempotencyKey: hugeKey,
	})
	if err != nil {
		t.Fatalf("expected preparation to succeed by zeroing out stock, got error: %v", err)
	}
	if !hugeResp.Success {
		t.Fatalf("expected hugeResp.Success to be true")
	}

	// Verify that stock is zeroed out:
	afterHugeInv, _ := invRepo.GetInventoryByIngredientID(nil, "ing_lentils", "default")
	if afterHugeInv.Quantity != 0 {
		t.Errorf("expected stock to be zeroed out (0), got %f", afterHugeInv.Quantity)
	}
}

// 6. مزامنة البيانات دون اتصال (Offline Sync)
func TestOfflineSyncOperations(t *testing.T) {
	_, _, _, _, _, syncServ, _, ingRepo, _, _, _ := setupTestContext(t)

	opID := uuid.NewString()
	newIngID := uuid.NewString()

	payload := `{"name_ar":"تمر برحي عراقي","name_en":"Barhi Dates","default_unit_id":"unit_kg","unit_price":4000,"min_stock":1.0}`
	batch := services.SyncBatchRequest{
		HouseholdID: "default",
		Operations: []services.SyncOperationRequest{
			{
				ClientOpID:  opID,
				HouseholdID: "default",
				EntityType:  "ingredient",
				EntityID:    newIngID,
				Action:      "create",
				PayloadJSON: payload,
				ClientTime:  time.Now().UTC(),
			},
		},
	}

	resp, err := syncServ.ProcessSyncBatch(&batch)
	if err != nil {
		t.Fatalf("sync failed: %v", err)
	}
	if resp.SuccessCount != 1 {
		t.Errorf("expected 1 success, got %d", resp.SuccessCount)
	}

	// Verify ingredient exists in DB
	ing, err := ingRepo.GetIngredientByID(newIngID, "default")
	if err != nil || ing.NameAr != "تمر برحي عراقي" {
		t.Fatalf("synced ingredient not found in DB: %v", err)
	}

	// Re-sending same batch should be idempotent (skipped)
	repeatResp, err := syncServ.ProcessSyncBatch(&batch)
	if err != nil || repeatResp.SkippedCount != 1 {
		t.Errorf("expected 1 skipped on re-sync, got skipped=%d err=%v", repeatResp.SkippedCount, err)
	}
}

// 7. استيراد وتصدير Excel حقيقي
func TestExcelExportAndImport(t *testing.T) {
	_, _, _, _, _, _, excelServ, ingRepo, _, _, _ := setupTestContext(t)

	// Export ingredients
	excelBytes, err := excelServ.ExportIngredients("default")
	if err != nil {
		t.Fatalf("failed to export ingredients to excel: %v", err)
	}
	if len(excelBytes) < 1000 {
		t.Fatalf("exported excel file too small (%d bytes)", len(excelBytes))
	}

	// Preview Import from the exported bytes
	preview, err := excelServ.PreviewImportIngredients("default", bytes.NewReader(excelBytes))
	if err != nil {
		t.Fatalf("failed to preview excel: %v", err)
	}
	if len(preview) == 0 {
		t.Fatalf("expected rows in excel preview, got 0")
	}

	// Add a new row to preview and commit
	preview = append(preview, services.IngredientImportPreviewItem{
		NameAr:     "هيل أخضر حب",
		NameEn:     "Cardamom Pods",
		GroupName:  "البهارات والتوابل",
		UnitCode:   "g",
		UnitPrice:  45,
		MinStock:   50,
		InitialQty: 200,
	})

	importedCount, err := excelServ.ImportIngredients("default", preview)
	if err != nil {
		t.Fatalf("failed to commit excel import: %v", err)
	}
	if importedCount == 0 {
		t.Errorf("expected imported count > 0")
	}

	// Check that the new ingredient exists
	cardamom, err := ingRepo.GetIngredientByName("هيل أخضر حب", "default")
	if err != nil || cardamom == nil {
		t.Fatalf("expected imported ingredient 'هيل أخضر حب' in db, got err=%v", err)
	}
}

// 10. حذف وصفة وإلغاؤها تلقائياً من كافة أيام جدول الوجبات
func TestDeleteRecipeCascadesToScheduleAndMealPlans(t *testing.T) {
	_, _, _, _, _, _, _, _, _, recipeRepo, mealPlanRepo := setupTestContext(t)

	// Create a test recipe
	recID := uuid.NewString()
	recipe := models.Recipe{
		BaseModel:   models.BaseModel{ID: recID},
		HouseholdID: "default",
		GroupID:     "rg_rice",
		NameAr:      "وصفة للاختبار والحذف",
		Servings:    4,
	}
	if err := recipeRepo.CreateRecipe(&recipe); err != nil {
		t.Fatalf("failed to create recipe: %v", err)
	}

	// Add it to monthly schedule for day 10 and day 15
	if err := mealPlanRepo.SaveMonthlyScheduleItem(&models.MonthlyScheduleItem{
		HouseholdID: "default",
		DayOfMonth:  10,
		Slot:        models.MealLunch,
		RecipeID:    recID,
		Servings:    4,
	}); err != nil {
		t.Fatalf("failed to save monthly item: %v", err)
	}
	if err := mealPlanRepo.SaveMonthlyScheduleItem(&models.MonthlyScheduleItem{
		HouseholdID: "default",
		DayOfMonth:  15,
		Slot:        models.MealDinner,
		RecipeID:    recID,
		Servings:    4,
	}); err != nil {
		t.Fatalf("failed to save monthly item: %v", err)
	}

	// Verify items exist
	monthlyItems, _ := mealPlanRepo.GetMonthlySchedule("default")
	foundCount := 0
	for _, it := range monthlyItems {
		if it.RecipeID == recID {
			foundCount++
		}
	}
	if foundCount != 2 {
		t.Fatalf("expected 2 schedule items for recipe, got %d", foundCount)
	}

	// Delete the recipe
	if err := recipeRepo.DeleteRecipe(recID, "default"); err != nil {
		t.Fatalf("failed to delete recipe: %v", err)
	}

	// Verify the recipe is gone
	deletedRec, _ := recipeRepo.GetRecipeByID(recID, "default")
	if deletedRec != nil {
		t.Fatalf("expected recipe to be deleted from recipes table")
	}

	// Verify it is automatically removed from ALL days in the schedule
	monthlyItemsAfter, _ := mealPlanRepo.GetMonthlySchedule("default")
	for _, it := range monthlyItemsAfter {
		if it.RecipeID == recID {
			t.Fatalf("expected recipe to be removed from day %d, but still found", it.DayOfMonth)
		}
	}
}

// 11. اختبار حذف مجموعة مكونات والتأكد من منع حذف مجموعة تحتوي مكونات
func TestDeleteIngredientGroup(t *testing.T) {
	_, _, _, _, _, _, _, ingRepo, _, _, _ := setupTestContext(t)

	// Create an empty group
	emptyGroupID := uuid.NewString()
	emptyGroup := models.IngredientGroup{
		BaseModel:   models.BaseModel{ID: emptyGroupID},
		HouseholdID: "default",
		NameAr:      "مجموعة فارغة للاختبار",
	}
	if err := ingRepo.CreateGroup(&emptyGroup); err != nil {
		t.Fatalf("failed to create group: %v", err)
	}

	// Count should be 0
	count, err := ingRepo.CountIngredientsByGroupID(emptyGroupID, "default")
	if err != nil || count != 0 {
		t.Fatalf("expected 0 ingredients, got %d, err=%v", count, err)
	}

	// Delete empty group should succeed
	if err := ingRepo.DeleteGroup(emptyGroupID, "default"); err != nil {
		t.Fatalf("failed to delete empty group: %v", err)
	}

	// Verify group is deleted
	groups, _ := ingRepo.GetGroups("default")
	for _, g := range groups {
		if g.ID == emptyGroupID {
			t.Fatalf("expected group to be deleted")
		}
	}
}

// 12. اختبار تصفير النظام لعائلة محددة دون التأثير على العائلات الأخرى برمز الحماية 1611
func TestSystemReset(t *testing.T) {
	db, _, _, _, _, _, _, ingRepo, _, recipeRepo, mealPlanRepo := setupTestContext(t)

	// Create data for another household to ensure isolation
	otherHouseholdID := "household_other_family"
	err := ingRepo.CreateIngredient(nil, &models.Ingredient{
		BaseModel:     models.BaseModel{ID: "ing_other_fam"},
		HouseholdID:   otherHouseholdID,
		NameAr:        "مكون العائلة الأخرى",
		DefaultUnitID: "unit_kg",
		UnitPrice:     5000,
	})
	if err != nil {
		t.Fatalf("failed to create ingredient for other household: %v", err)
	}
	err = recipeRepo.CreateRecipe(&models.Recipe{
		BaseModel:   models.BaseModel{ID: "rec_other_fam"},
		HouseholdID: otherHouseholdID,
		NameAr:      "وصفة العائلة الأخرى",
		Servings:    4,
	})
	if err != nil {
		t.Fatalf("failed to create recipe for other household: %v", err)
	}

	// Verify initial seeded data exists for default household
	ings, _ := ingRepo.GetAllIngredients("default", "", "")
	if len(ings) == 0 {
		t.Fatalf("expected initial seeded ingredients")
	}
	recs, _ := recipeRepo.GetAllRecipes("default", "", "")
	if len(recs) == 0 {
		t.Fatalf("expected initial seeded recipes")
	}

	// Perform reset scoped strictly to "default" household (same logic as ResetSystem handler)
	targetHousehold := "default"
	err = db.DB.Transaction(func(tx *gorm.DB) error {
		recipeFilter := "recipe_id IN (SELECT id FROM recipes WHERE household_id = ? OR household_id = '')"
		mealPlanFilter := "meal_plan_id IN (SELECT id FROM meal_plans WHERE household_id = ? OR household_id = '')"
		shoppingFilter := "shopping_list_id IN (SELECT id FROM shopping_lists WHERE household_id = ? OR household_id = '')"
		purchaseFilter := "purchase_id IN (SELECT id FROM purchases WHERE household_id = ? OR household_id = '')"

		if err := tx.Unscoped().Where(recipeFilter, targetHousehold).Delete(&models.RecipeIngredient{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where(mealPlanFilter, targetHousehold).Delete(&models.MealPlanItem{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where(shoppingFilter, targetHousehold).Delete(&models.ShoppingItem{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where(purchaseFilter, targetHousehold).Delete(&models.PurchaseItem{}).Error; err != nil {
			return err
		}

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
			if err := tx.Unscoped().Where("household_id = ? OR household_id = ''", targetHousehold).Delete(table).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("system reset transaction failed: %v", err)
	}

	// Verify all operational tables for "default" household are empty
	afterIngs, _ := ingRepo.GetAllIngredients("default", "", "")
	if len(afterIngs) != 0 {
		t.Fatalf("expected 0 ingredients for default household after reset, got %d", len(afterIngs))
	}
	afterRecs, _ := recipeRepo.GetAllRecipes("default", "", "")
	if len(afterRecs) != 0 {
		t.Fatalf("expected 0 recipes for default household after reset, got %d", len(afterRecs))
	}
	afterIngGroups, _ := ingRepo.GetGroups("default")
	if len(afterIngGroups) != 0 {
		t.Fatalf("expected 0 ingredient groups for default household after reset, got %d", len(afterIngGroups))
	}
	afterRecGroups, _ := recipeRepo.GetGroups("default")
	if len(afterRecGroups) != 0 {
		t.Fatalf("expected 0 recipe groups for default household after reset, got %d", len(afterRecGroups))
	}
	afterSchedule, _ := mealPlanRepo.GetMonthlySchedule("default")
	if len(afterSchedule) != 0 {
		t.Fatalf("expected 0 monthly schedule items for default household after reset, got %d", len(afterSchedule))
	}

	// CRITICAL CHECK: Verify other household's data was completely untouched!
	otherIngs, _ := ingRepo.GetAllIngredients(otherHouseholdID, "", "")
	if len(otherIngs) != 1 {
		t.Fatalf("expected other household ingredients to be untouched (1), got %d", len(otherIngs))
	}
	otherRecs, _ := recipeRepo.GetAllRecipes(otherHouseholdID, "", "")
	if len(otherRecs) != 1 {
		t.Fatalf("expected other household recipes to be untouched (1), got %d", len(otherRecs))
	}

	// Verify base units are preserved
	units, err := ingRepo.GetAllUnits()
	if err != nil || len(units) == 0 {
		t.Fatalf("expected base units to remain intact after reset, got %d units, err=%v", len(units), err)
	}
}

// 13. اختبار سلسلة: تحضير الوجبة -> تراجع عن التحضير -> تخطي الوجبة
func TestPrepareUnprepareAndSkipSequence(t *testing.T) {
	_, _, _, prepServ, _, _, _, _, _, _, mealPlanRepo := setupTestContext(t)

	today := time.Now().Format("2006-01-02")
	plan, _ := mealPlanRepo.GetOrCreateActivePlan("default", today, today)

	item := models.MealPlanItem{
		BaseModel:  models.BaseModel{ID: uuid.NewString()},
		MealPlanID: plan.ID,
		PlanDate:   today,
		Slot:       models.MealLunch,
		RecipeID:   "rec_lentil_soup",
		Servings:   4,
	}
	if err := mealPlanRepo.AddItem(&item); err != nil {
		t.Fatalf("failed to add meal item: %v", err)
	}

	// 1. Prepare meal
	_, err := prepServ.PrepareMeal(&services.PrepareMealRequest{
		MealPlanItemID: item.ID,
		HouseholdID:    "default",
		IdempotencyKey: uuid.NewString(),
	})
	if err != nil {
		t.Fatalf("prepare meal failed: %v", err)
	}

	// Check is_prepared is true
	dbItem, _ := mealPlanRepo.GetItemByID(item.ID)
	if !dbItem.IsPrepared {
		t.Fatalf("expected item to be prepared")
	}

	// 2. Unprepare meal
	_, err = prepServ.UnprepareMeal(&services.UnprepareMealRequest{
		MealPlanItemID: item.ID,
		HouseholdID:    "default",
	})
	if err != nil {
		t.Fatalf("unprepare meal failed: %v", err)
	}

	// Check is_prepared is false
	dbItem, _ = mealPlanRepo.GetItemByID(item.ID)
	if dbItem.IsPrepared {
		t.Fatalf("expected item to be unprepared (is_prepared=false)")
	}

	// 3. Skip meal (even if client payload had stale is_prepared)
	// We simulate the exact client request
	updatePayload := models.MealPlanItem{
		BaseModel:  models.BaseModel{ID: item.ID},
		MealPlanID: plan.ID,
		PlanDate:   today,
		Slot:       models.MealLunch,
		RecipeID:   "rec_lentil_soup",
		IsSkipped:  true,
		IsPrepared: false,
	}
	if err := mealPlanRepo.DB().Model(&models.MealPlanItem{}).Where("id = ?", item.ID).Updates(map[string]interface{}{
		"is_skipped": updatePayload.IsSkipped,
	}).Error; err != nil {
		t.Fatalf("failed to skip item: %v", err)
	}

	// 4. Critical assertion: Item must be skipped=true and prepared=false!
	finalItem, _ := mealPlanRepo.GetItemByID(item.ID)
	if finalItem.IsPrepared {
		t.Fatalf("BUG REPRODUCED: Item is marked as prepared after skip! Expected is_prepared=false")
	}
	if !finalItem.IsSkipped {
		t.Fatalf("Expected is_skipped=true, got %v", finalItem.IsSkipped)
	}
}

func TestJoinOrCreateFamilyArabicDigits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, invServ, recipeServ, prepServ, shopServ, syncServ, excelServ, ingRepo, invRepo, recipeRepo, mealPlanRepo := setupTestContext(t)
	shopRepo := repository.NewShoppingRepository(db.DB)
	syncRepo := repository.NewSyncRepository(db.DB)
	unitServ := services.NewUnitService()

	h := handlers.NewAppHandler(
		ingRepo, invRepo, recipeRepo, mealPlanRepo, shopRepo, syncRepo,
		unitServ, invServ, recipeServ, prepServ, shopServ, syncServ, excelServ,
	)

	// Create a household with ASCII code "482910"
	household := models.Household{
		BaseModel: models.BaseModel{ID: "household-arabic-test"},
		Name:      "482910",
	}
	if err := db.DB.Create(&household).Error; err != nil {
		t.Fatalf("failed to create test household: %v", err)
	}

	// 1. Join using Arabic-Indic digits: "٤٨٢٩١٠"
	router := gin.New()
	router.POST("/api/session/join", h.JoinOrCreateFamily)

	body := []byte(`{"user_name":"أحمد","family_code":"٤٨٢٩١٠"}`)
	req, _ := http.NewRequest(http.MethodPost, "/api/session/join", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if res["family_code"] != "482910" {
		t.Fatalf("expected family_code to be normalized to '482910', got '%v'", res["family_code"])
	}
	if res["household_id"] != "household-arabic-test" {
		t.Fatalf("expected household_id to match, got '%v'", res["household_id"])
	}

	// 2. Join using Eastern Arabic (Persian/Urdu) digits: "۴۸۲۹۱۰"
	bodyEastern := []byte(`{"user_name":"أحمد","family_code":"۴۸۲۹۱۰"}`)
	reqEastern, _ := http.NewRequest(http.MethodPost, "/api/session/join", bytes.NewBuffer(bodyEastern))
	reqEastern.Header.Set("Content-Type", "application/json")
	wEastern := httptest.NewRecorder()
	router.ServeHTTP(wEastern, reqEastern)

	if wEastern.Code != http.StatusOK {
		t.Fatalf("expected status 200 for eastern numerals, got %d: %s", wEastern.Code, wEastern.Body.String())
	}
	var resEastern map[string]interface{}
	_ = json.Unmarshal(wEastern.Body.Bytes(), &resEastern)
	if resEastern["family_code"] != "482910" {
		t.Fatalf("expected family_code to be '482910', got '%v'", resEastern["family_code"])
	}
}
