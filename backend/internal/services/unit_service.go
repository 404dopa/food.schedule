package services

import (
	"errors"
	"fmt"
	"strings"

	"bayti-kitchen/backend/internal/models"
)

var (
	ErrIncompatibleUnits = errors.New("cannot convert between incompatible units without density definition")
	ErrDensityRequired   = errors.New("density (g/ml) is required to convert between mass and volume")
	ErrUnknownUnit       = errors.New("unknown unit code")
)

type UnitService struct{}

func NewUnitService() *UnitService {
	return &UnitService{}
}

// ConvertQuantity converts a value from fromUnit to toUnit for a given ingredient.
// density is in g/ml (grams per milliliter). If density is 0, cross-dimension conversion fails.
func (s *UnitService) ConvertQuantity(val float64, fromUnit, toUnit *models.Unit, density float64) (float64, error) {
	if fromUnit == nil || toUnit == nil {
		return 0, errors.New("nil unit provided")
	}

	if fromUnit.ID == toUnit.ID || strings.EqualFold(fromUnit.Code, toUnit.Code) {
		return val, nil
	}

	fromDim := fromUnit.Dimension
	toDim := toUnit.Dimension

	// Case 1: Same dimension (e.g. kg -> g, or l -> ml, or piece -> pack)
	if fromDim == toDim {
		// Convert to base unit first, then to target unit
		// val in fromUnit -> valInBase = val * fromUnit.FactorToBase
		// target = valInBase / toUnit.FactorToBase
		if toUnit.FactorToBase == 0 {
			return 0, fmt.Errorf("invalid factor_to_base for unit %s", toUnit.Code)
		}
		valInBase := val * fromUnit.FactorToBase
		return valInBase / toUnit.FactorToBase, nil
	}

	// Case 2: Mass <-> Volume
	if (fromDim == models.DimensionMass && toDim == models.DimensionVolume) ||
		(fromDim == models.DimensionVolume && toDim == models.DimensionMass) {

		if density <= 0 {
			return 0, fmt.Errorf("%w: cannot convert %s (%s) to %s (%s) without ingredient density",
				ErrDensityRequired, fromUnit.NameAr, fromDim, toUnit.NameAr, toDim)
		}

		if fromDim == models.DimensionMass && toDim == models.DimensionVolume {
			// Mass -> Base Mass (grams)
			valInGrams := val * fromUnit.FactorToBase
			// Volume in ml = grams / density
			valInMl := valInGrams / density
			// Target volume unit
			return valInMl / toUnit.FactorToBase, nil
		}

		if fromDim == models.DimensionVolume && toDim == models.DimensionMass {
			// Volume -> Base Volume (ml)
			valInMl := val * fromUnit.FactorToBase
			// Mass in grams = ml * density
			valInGrams := valInMl * density
			// Target mass unit
			return valInGrams / toUnit.FactorToBase, nil
		}
	}

	// Case 3: Count <-> Mass/Volume (not allowed unless piece weight/volume defined, currently blocked)
	return 0, fmt.Errorf("%w: cannot convert dimension '%s' to '%s'", ErrIncompatibleUnits, fromDim, toDim)
}
