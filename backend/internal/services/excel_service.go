package services

import (
	"bytes"
	"fmt"
	"io"
	"strconv"
	"strings"

	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

type ExcelService struct {
	ingRepo      *repository.IngredientRepository
	recipeRepo   *repository.RecipeRepository
	mealPlanRepo *repository.MealPlanRepository
	invRepo      *repository.InventoryRepository
	db           *gorm.DB
}

func NewExcelService(
	ingRepo *repository.IngredientRepository,
	recipeRepo *repository.RecipeRepository,
	mealPlanRepo *repository.MealPlanRepository,
	invRepo *repository.InventoryRepository,
	db *gorm.DB,
) *ExcelService {
	return &ExcelService{
		ingRepo:      ingRepo,
		recipeRepo:   recipeRepo,
		mealPlanRepo: mealPlanRepo,
		invRepo:      invRepo,
		db:           db,
	}
}

// ExportIngredients generates an Excel sheet of all ingredients and inventory
func (s *ExcelService) ExportIngredients(householdID string) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheet := "المكونات والمخزون"
	f.SetSheetName("Sheet1", sheet)

	// Headers
	headers := []string{"اسم المكون (عربي)", "اسم المكون (إنجليزي)", "المجموعة", "الوحدة", "سعر الوحدة (د.ع)", "الحد الأدنى", "الكمية المتوفرة", "الكثافة (غم/مل)"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	ingredients, err := s.ingRepo.GetAllIngredients(householdID, "", "")
	if err != nil {
		return nil, err
	}

	for rowIdx, ing := range ingredients {
		row := rowIdx + 2
		groupName := ""
		if ing.Group != nil {
			groupName = ing.Group.NameAr
		}
		unitName := ""
		if ing.DefaultUnit != nil {
			unitName = ing.DefaultUnit.Code
		}
		currentQty := 0.0
		if ing.Inventory != nil {
			currentQty = ing.Inventory.Quantity
		}

		f.SetCellValue(sheet, fmt.Sprintf("A%d", row), ing.NameAr)
		f.SetCellValue(sheet, fmt.Sprintf("B%d", row), ing.NameEn)
		f.SetCellValue(sheet, fmt.Sprintf("C%d", row), groupName)
		f.SetCellValue(sheet, fmt.Sprintf("D%d", row), unitName)
		f.SetCellValue(sheet, fmt.Sprintf("E%d", row), ing.UnitPrice)
		f.SetCellValue(sheet, fmt.Sprintf("F%d", row), ing.MinStock)
		f.SetCellValue(sheet, fmt.Sprintf("G%d", row), currentQty)
		f.SetCellValue(sheet, fmt.Sprintf("H%d", row), ing.Density)
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ExportRecipes generates an Excel file containing all recipes and ingredients
func (s *ExcelService) ExportRecipes(householdID string) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheet := "الوصفات والمكونات"
	f.SetSheetName("Sheet1", sheet)

	headers := []string{"اسم الوصفة", "التصنيف", "عدد الحصص", "وقت التحضير (دقيقة)", "اسم المكون", "الكمية", "الوحدة", "ملاحظات", "طريقة التحضير"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	recipes, err := s.recipeRepo.GetAllRecipes(householdID, "", "")
	if err != nil {
		return nil, err
	}

	currentRow := 2
	for _, rec := range recipes {
		groupName := ""
		if rec.Group != nil {
			groupName = rec.Group.NameAr
		}

		if len(rec.Ingredients) == 0 {
			f.SetCellValue(sheet, fmt.Sprintf("A%d", currentRow), rec.NameAr)
			f.SetCellValue(sheet, fmt.Sprintf("B%d", currentRow), groupName)
			f.SetCellValue(sheet, fmt.Sprintf("C%d", currentRow), rec.Servings)
			f.SetCellValue(sheet, fmt.Sprintf("D%d", currentRow), rec.PrepTimeMin)
			f.SetCellValue(sheet, fmt.Sprintf("I%d", currentRow), rec.Instructions)
			currentRow++
			continue
		}

		for _, ri := range rec.Ingredients {
			ingName := ""
			if ri.Ingredient != nil {
				ingName = ri.Ingredient.NameAr
			}
			unitCode := ""
			if ri.Unit != nil {
				unitCode = ri.Unit.Code
			}

			f.SetCellValue(sheet, fmt.Sprintf("A%d", currentRow), rec.NameAr)
			f.SetCellValue(sheet, fmt.Sprintf("B%d", currentRow), groupName)
			f.SetCellValue(sheet, fmt.Sprintf("C%d", currentRow), rec.Servings)
			f.SetCellValue(sheet, fmt.Sprintf("D%d", currentRow), rec.PrepTimeMin)
			f.SetCellValue(sheet, fmt.Sprintf("E%d", currentRow), ingName)
			f.SetCellValue(sheet, fmt.Sprintf("F%d", currentRow), ri.Quantity)
			f.SetCellValue(sheet, fmt.Sprintf("G%d", currentRow), unitCode)
			f.SetCellValue(sheet, fmt.Sprintf("H%d", currentRow), ri.Notes)
			f.SetCellValue(sheet, fmt.Sprintf("I%d", currentRow), rec.Instructions)
			currentRow++
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

type IngredientImportPreviewItem struct {
	NameAr     string  `json:"name_ar"`
	NameEn     string  `json:"name_en"`
	GroupName  string  `json:"group_name"`
	UnitCode   string  `json:"unit_code"`
	UnitPrice  float64 `json:"unit_price"`
	MinStock   float64 `json:"min_stock"`
	InitialQty float64 `json:"initial_qty"`
	Density    float64 `json:"density"`
	IsExisting bool    `json:"is_existing"`
	Status     string  `json:"status"` // "new", "update", "invalid"
	Error      string  `json:"error,omitempty"`
}

type RecipeImportPreviewItem struct {
	RecipeName    string   `json:"recipe_name"`
	GroupName     string   `json:"group_name"`
	Servings      int      `json:"servings"`
	PrepTime      int      `json:"prep_time"`
	Instructions  string   `json:"instructions"`
	Ingredients   []string `json:"ingredients"`
	MissingIngs   []string `json:"missing_ingredients"` // unregistered ingredients
	IsDuplicate   bool     `json:"is_duplicate"`
}

// PreviewImportIngredients parses uploaded excel and returns validation preview
func (s *ExcelService) PreviewImportIngredients(householdID string, r io.Reader) ([]IngredientImportPreviewItem, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, fmt.Errorf("failed to open excel file: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("excel file is empty")
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, err
	}

	if len(rows) < 2 {
		return nil, fmt.Errorf("excel file has no data rows")
	}

	var preview []IngredientImportPreviewItem

	for i := 1; i < len(rows); i++ {
		row := rows[i]
		if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
			continue
		}

		nameAr := strings.TrimSpace(row[0])
		nameEn := ""
		if len(row) > 1 {
			nameEn = strings.TrimSpace(row[1])
		}
		groupName := ""
		if len(row) > 2 {
			groupName = strings.TrimSpace(row[2])
		}
		unitCode := "g"
		if len(row) > 3 && strings.TrimSpace(row[3]) != "" {
			unitCode = strings.TrimSpace(row[3])
		}
		unitPrice := 0.0
		if len(row) > 4 {
			unitPrice, _ = strconv.ParseFloat(strings.TrimSpace(row[4]), 64)
		}
		minStock := 0.0
		if len(row) > 5 {
			minStock, _ = strconv.ParseFloat(strings.TrimSpace(row[5]), 64)
		}
		initialQty := 0.0
		if len(row) > 6 {
			initialQty, _ = strconv.ParseFloat(strings.TrimSpace(row[6]), 64)
		}
		density := 0.0
		if len(row) > 7 {
			density, _ = strconv.ParseFloat(strings.TrimSpace(row[7]), 64)
		}

		existing, _ := s.ingRepo.GetIngredientByName(nameAr, householdID)
		isExisting := existing != nil
		status := "new"
		if isExisting {
			status = "update"
		}

		preview = append(preview, IngredientImportPreviewItem{
			NameAr:     nameAr,
			NameEn:     nameEn,
			GroupName:  groupName,
			UnitCode:   unitCode,
			UnitPrice:  unitPrice,
			MinStock:   minStock,
			InitialQty: initialQty,
			Density:    density,
			IsExisting: isExisting,
			Status:     status,
		})
	}

	return preview, nil
}

// ImportIngredients commits the ingredients into database with option to create missing groups/units
func (s *ExcelService) ImportIngredients(householdID string, items []IngredientImportPreviewItem) (int, error) {
	importedCount := 0

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Cache groups and units
		groups, _ := s.ingRepo.GetGroups(householdID)
		groupMap := make(map[string]string)
		for _, g := range groups {
			groupMap[strings.ToLower(g.NameAr)] = g.ID
			groupMap[strings.ToLower(g.NameEn)] = g.ID
		}

		units, _ := s.ingRepo.GetAllUnits()
		unitMap := make(map[string]string)
		for _, u := range units {
			unitMap[strings.ToLower(u.Code)] = u.ID
			unitMap[strings.ToLower(u.NameAr)] = u.ID
		}

		for _, item := range items {
			if item.NameAr == "" {
				continue
			}

			// Group ID
			groupID := ""
			if item.GroupName != "" {
				if id, exists := groupMap[strings.ToLower(item.GroupName)]; exists {
					groupID = id
				} else {
					// Auto create group
					newGroup := models.IngredientGroup{
						BaseModel:   models.BaseModel{ID: uuid.NewString()},
						HouseholdID: householdID,
						NameAr:      item.GroupName,
					}
					if err := tx.Create(&newGroup).Error; err == nil {
						groupID = newGroup.ID
						groupMap[strings.ToLower(item.GroupName)] = groupID
					}
				}
			}

			// Unit ID
			unitID := ""
			if id, exists := unitMap[strings.ToLower(item.UnitCode)]; exists {
				unitID = id
			} else {
				// Fallback to first available unit
				if len(units) > 0 {
					unitID = units[0].ID
				}
			}

			existing, _ := s.ingRepo.GetIngredientByName(item.NameAr, householdID)
			if existing != nil {
				// Update
				existing.NameEn = item.NameEn
				if groupID != "" {
					existing.GroupID = groupID
				}
				if unitID != "" {
					existing.DefaultUnitID = unitID
				}
				existing.UnitPrice = item.UnitPrice
				existing.MinStock = item.MinStock
				existing.Density = item.Density
				if err := s.ingRepo.UpdateIngredient(tx, existing); err != nil {
					return err
				}
			} else {
				// Create
				newIng := models.Ingredient{
					BaseModel:     models.BaseModel{ID: uuid.NewString()},
					HouseholdID:   householdID,
					GroupID:       groupID,
					NameAr:        item.NameAr,
					NameEn:        item.NameEn,
					DefaultUnitID: unitID,
					UnitPrice:     item.UnitPrice,
					MinStock:      item.MinStock,
					Density:       item.Density,
				}
				if err := s.ingRepo.CreateIngredient(tx, &newIng); err != nil {
					return err
				}

				// Create inventory
				newInv := models.Inventory{
					BaseModel:    models.BaseModel{ID: uuid.NewString()},
					HouseholdID:  householdID,
					IngredientID: newIng.ID,
					Quantity:     item.InitialQty,
					UnitID:       unitID,
				}
				if err := s.invRepo.UpsertInventory(tx, &newInv); err != nil {
					return err
				}
			}
			importedCount++
		}
		return nil
	})

	return importedCount, err
}
