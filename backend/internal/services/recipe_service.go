package services

import (
	"bayti-kitchen/backend/internal/models"
	"bayti-kitchen/backend/internal/repository"
)

type RecipeService struct {
	recipeRepo *repository.RecipeRepository
	invRepo    *repository.InventoryRepository
	unitServ   *UnitService
}

func NewRecipeService(recipeRepo *repository.RecipeRepository, invRepo *repository.InventoryRepository, unitServ *UnitService) *RecipeService {
	return &RecipeService{
		recipeRepo: recipeRepo,
		invRepo:    invRepo,
		unitServ:   unitServ,
	}
}

// EnrichRecipe computes recipe total cost, cost per serving, and checks inventory for missing ingredients
func (s *RecipeService) EnrichRecipe(recipe *models.Recipe) {
	if recipe == nil {
		return
	}

	var totalCost float64
	allAvailable := true

	for i := range recipe.Ingredients {
		ri := &recipe.Ingredients[i]
		ing := ri.Ingredient
		if ing == nil {
			continue
		}

		// Calculate cost of this ingredient
		// Recipe quantity in ri.Unit -> convert to ing.DefaultUnit
		if ing.DefaultUnit != nil && ri.Unit != nil {
			qtyInDefaultUnit, err := s.unitServ.ConvertQuantity(ri.Quantity, ri.Unit, ing.DefaultUnit, ing.Density)
			if err == nil {
				cost := qtyInDefaultUnit * ing.UnitPrice
				totalCost += cost
			}
		}

		// Check stock availability
		var currentStock float64
		var stockUnitName string
		if ing.Inventory != nil {
			currentStock = ing.Inventory.Quantity
			if ing.Inventory.Unit != nil {
				stockUnitName = ing.Inventory.Unit.NameAr
			}
		}

		ri.InStockQuantity = currentStock
		ri.InStockUnit = stockUnitName

		// Convert required quantity to inventory unit for comparison
		if ing.Inventory != nil && ing.Inventory.Unit != nil && ri.Unit != nil {
			neededInStockUnit, err := s.unitServ.ConvertQuantity(ri.Quantity, ri.Unit, ing.Inventory.Unit, ing.Density)
			if err == nil {
				if currentStock < neededInStockUnit {
					ri.IsMissing = true
					ri.MissingAmount = neededInStockUnit - currentStock
					allAvailable = false
				} else {
					ri.IsMissing = false
					ri.MissingAmount = 0
				}
			} else {
				// Unit conversion error -> treat as missing
				ri.IsMissing = true
				ri.MissingAmount = ri.Quantity
				allAvailable = false
			}
		} else {
			// No inventory record or unit
			if currentStock < ri.Quantity {
				ri.IsMissing = true
				ri.MissingAmount = ri.Quantity - currentStock
				allAvailable = false
			}
		}
	}

	recipe.TotalCost = totalCost
	if recipe.Servings > 0 {
		recipe.CostPerServe = totalCost / float64(recipe.Servings)
	}
	recipe.IsAvailable = allAvailable
}

func (s *RecipeService) EnrichRecipes(recipes []models.Recipe) {
	for i := range recipes {
		s.EnrichRecipe(&recipes[i])
	}
}
