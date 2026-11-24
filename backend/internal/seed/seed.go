package seed

import (
	"log"
	"time"

	"bayti-kitchen/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func SeedDatabase(db *gorm.DB) error {
	var count int64
	db.Model(&models.Unit{}).Count(&count)
	if count > 0 {
		log.Println("Database already seeded. Skipping initial seed.")
		return nil
	}

	log.Println("Seeding Bayti Kitchen database with authentic Iraqi recipes and ingredients...")

	return db.Transaction(func(tx *gorm.DB) error {
		// 1. Units
		units := []models.Unit{
			{BaseModel: models.BaseModel{ID: "unit_kg"}, Code: "kg", NameAr: "كغم", NameEn: "Kilogram", Dimension: models.DimensionMass, FactorToBase: 1000, BaseUnitCode: "g"},
			{BaseModel: models.BaseModel{ID: "unit_g"}, Code: "g", NameAr: "غم", NameEn: "Gram", Dimension: models.DimensionMass, FactorToBase: 1, BaseUnitCode: "g"},
			{BaseModel: models.BaseModel{ID: "unit_l"}, Code: "l", NameAr: "لتر", NameEn: "Liter", Dimension: models.DimensionVolume, FactorToBase: 1000, BaseUnitCode: "ml"},
			{BaseModel: models.BaseModel{ID: "unit_ml"}, Code: "ml", NameAr: "مل", NameEn: "Milliliter", Dimension: models.DimensionVolume, FactorToBase: 1, BaseUnitCode: "ml"},
			{BaseModel: models.BaseModel{ID: "unit_piece"}, Code: "piece", NameAr: "حبة", NameEn: "Piece", Dimension: models.DimensionCount, FactorToBase: 1, BaseUnitCode: "piece"},
			{BaseModel: models.BaseModel{ID: "unit_pack"}, Code: "pack", NameAr: "كيس", NameEn: "Pack", Dimension: models.DimensionCount, FactorToBase: 1, BaseUnitCode: "piece"},
			{BaseModel: models.BaseModel{ID: "unit_can"}, Code: "can", NameAr: "علبة", NameEn: "Can", Dimension: models.DimensionCount, FactorToBase: 1, BaseUnitCode: "piece"},
		}
		for _, u := range units {
			if err := tx.Create(&u).Error; err != nil {
				return err
			}
		}

		// 2. Household & User
		household := models.Household{
			BaseModel: models.BaseModel{ID: "default"},
			Name:      "مطبخ بيتي العائلي",
			Currency:  "IQD",
		}
		if err := tx.Create(&household).Error; err != nil {
			return err
		}

		// 3. Ingredient Groups
		groups := []models.IngredientGroup{
			{BaseModel: models.BaseModel{ID: "grp_general"}, HouseholdID: "default", NameAr: "عامة", NameEn: "General", Icon: "Package", Color: "#10B981", SortOrder: 0},
			{BaseModel: models.BaseModel{ID: "grp_meat"}, HouseholdID: "default", NameAr: "اللحوم والدواجن", NameEn: "Meat & Poultry", Icon: "Beef", Color: "#EF4444", SortOrder: 1},
			{BaseModel: models.BaseModel{ID: "grp_grains"}, HouseholdID: "default", NameAr: "الحبوب والبقوليات", NameEn: "Grains & Legumes", Icon: "Wheat", Color: "#F59E0B", SortOrder: 2},
			{BaseModel: models.BaseModel{ID: "grp_veg"}, HouseholdID: "default", NameAr: "الخضروات الطازجة", NameEn: "Vegetables", Icon: "Carrot", Color: "#10B981", SortOrder: 3},
			{BaseModel: models.BaseModel{ID: "grp_spices"}, HouseholdID: "default", NameAr: "البهارات والتوابل", NameEn: "Spices", Icon: "Sparkles", Color: "#8B5CF6", SortOrder: 4},
			{BaseModel: models.BaseModel{ID: "grp_oils"}, HouseholdID: "default", NameAr: "الزيوت والدهون", NameEn: "Oils & Ghee", Icon: "Droplet", Color: "#EAB308", SortOrder: 5},
			{BaseModel: models.BaseModel{ID: "grp_dairy"}, HouseholdID: "default", NameAr: "الألبان والأجبان", NameEn: "Dairy", Icon: "Milk", Color: "#06B6D4", SortOrder: 6},
			{BaseModel: models.BaseModel{ID: "grp_canned"}, HouseholdID: "default", NameAr: "المعلبات والمؤونة", NameEn: "Canned & Pantry", Icon: "Package", Color: "#64748B", SortOrder: 7},
		}
		for _, g := range groups {
			if err := tx.Create(&g).Error; err != nil {
				return err
			}
		}

		// 4. Ingredients & Inventory
		type seedIng struct {
			id       string
			nameAr   string
			nameEn   string
			groupID  string
			unitID   string
			priceIQD float64
			minStock float64
			initQty  float64
			density  float64
			image    string
		}
		rawIngs := []seedIng{
			{"ing_lamb", "لحم غنم عراقي", "Iraqi Lamb", "grp_meat", "unit_kg", 18000, 1.0, 3.5, 0, "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=300"},
			{"ing_minced_meat", "لحم مفروم", "Minced Meat", "grp_meat", "unit_kg", 15000, 1.0, 2.0, 0, "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=300"},
			{"ing_rice_amber", "تمن عنبر عراقي", "Amber Rice", "grp_grains", "unit_kg", 3000, 2.0, 10.0, 0, "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300"},
			{"ing_rice_basmati", "تمن بسمتي", "Basmati Rice", "grp_grains", "unit_kg", 2000, 2.0, 8.0, 0, "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=300"},
			{"ing_lentils", "عدس أحمر", "Red Lentils", "grp_grains", "unit_kg", 2000, 0.5, 3.0, 0, "https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=300"},
			{"ing_chickpeas_split", "حمص مجروش", "Split Chickpeas", "grp_grains", "unit_kg", 2500, 0.5, 2.5, 0, "https://images.unsplash.com/photo-1585849834908-347113c1b184?w=300"},
			{"ing_onions", "بصل", "Onions", "grp_veg", "unit_kg", 1000, 1.0, 5.0, 0, "https://images.unsplash.com/photo-1508747703725-719777637510?w=300"},
			{"ing_tomatoes", "طماطة", "Tomatoes", "grp_veg", "unit_kg", 1250, 1.5, 4.0, 0, "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300"},
			{"ing_okra", "بامية عراقية", "Okra", "grp_veg", "unit_kg", 4000, 1.0, 2.0, 0, "https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?w=300"},
			{"ing_chard", "سلق طازج", "Chard Leaves", "grp_veg", "unit_pack", 500, 2.0, 4.0, 0, "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300"},
			{"ing_garlic", "ثوم", "Garlic", "grp_veg", "unit_kg", 3000, 0.2, 1.0, 0, "https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=300"},
			{"ing_tomato_paste", "معجون طماطة", "Tomato Paste", "grp_canned", "unit_can", 1500, 2.0, 6.0, 0, "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=300"},
			{"ing_limoo_basra", "نومي بصرة", "Dried Lime", "grp_spices", "unit_g", 15, 100.0, 500.0, 0, "https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=300"},
			{"ing_biryani_spices", "بهارات برياني", "Biryani Spices", "grp_spices", "unit_g", 20, 100.0, 300.0, 0, "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=300"},
			{"ing_dolma_spices", "بهارات دولمة", "Dolma Spices", "grp_spices", "unit_g", 20, 100.0, 250.0, 0, "https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=300"},
			{"ing_cooking_oil", "زيت نباتي", "Cooking Oil", "grp_oils", "unit_l", 2500, 1.0, 4.0, 0.92, "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300"},
			{"ing_ghee", "دهن حر / سمن", "Pure Ghee", "grp_oils", "unit_kg", 12000, 0.5, 1.5, 0.9, "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=300"},
			{"ing_vermicelli", "شعرية", "Vermicelli", "grp_grains", "unit_pack", 750, 1.0, 4.0, 0, "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=300"},
		}

		for _, item := range rawIngs {
			ing := models.Ingredient{
				BaseModel:     models.BaseModel{ID: item.id},
				HouseholdID:   "default",
				GroupID:       item.groupID,
				NameAr:        item.nameAr,
				NameEn:        item.nameEn,
				ImageURL:      item.image,
				DefaultUnitID: item.unitID,
				UnitPrice:     item.priceIQD,
				MinStock:      item.minStock,
				Density:       item.density,
			}
			if err := tx.Create(&ing).Error; err != nil {
				return err
			}

			inv := models.Inventory{
				BaseModel:    models.BaseModel{ID: uuid.NewString()},
				HouseholdID:  "default",
				IngredientID: item.id,
				Quantity:     item.initQty,
				UnitID:       item.unitID,
				LastStockAt:  time.Now().UTC(),
			}
			if err := tx.Create(&inv).Error; err != nil {
				return err
			}
		}

		// 5. Recipe Groups
		recipeGroups := []models.RecipeGroup{
			{BaseModel: models.BaseModel{ID: "rg_general"}, HouseholdID: "default", NameAr: "عامة", NameEn: "General", Icon: "Utensils", Color: "#10B981"},
			{BaseModel: models.BaseModel{ID: "rg_iraqi"}, HouseholdID: "default", NameAr: "أكلات عراقية أصيلة", NameEn: "Authentic Iraqi", Icon: "Crown", Color: "#DC2626"},
			{BaseModel: models.BaseModel{ID: "rg_stews"}, HouseholdID: "default", NameAr: "المرق والطبيخ", NameEn: "Stews", Icon: "Soup", Color: "#D97706"},
			{BaseModel: models.BaseModel{ID: "rg_rice"}, HouseholdID: "default", NameAr: "أطباق التمن والرز", NameEn: "Rice Dishes", Icon: "Wheat", Color: "#2563EB"},
			{BaseModel: models.BaseModel{ID: "rg_soups"}, HouseholdID: "default", NameAr: "الشوربات", NameEn: "Soups", Icon: "Coffee", Color: "#059669"},
			{BaseModel: models.BaseModel{ID: "rg_grills"}, HouseholdID: "default", NameAr: "المشويات والكباب", NameEn: "Grills & Kebabs", Icon: "Flame", Color: "#B91C1C"},
		}
		for _, rg := range recipeGroups {
			if err := tx.Create(&rg).Error; err != nil {
				return err
			}
		}

		// 6. Authentic Recipes
		type recIngDef struct {
			ingID string
			qty   float64
			unit  string
			notes string
		}

		type recDef struct {
			id           string
			nameAr       string
			nameEn       string
			groupID      string
			servings     int
			prepTime     int
			cookTime     int
			image        string
			description  string
			instructions string
			ingredients  []recIngDef
		}

		recipes := []recDef{
			{
				id:          "rec_dolma",
				nameAr:      "دولمة عراقية مشكلة",
				nameEn:      "Iraqi Dolma",
				groupID:     "rg_iraqi",
				servings:    6,
				prepTime:    60,
				cookTime:    90,
				image:       "https://images.unsplash.com/photo-1544025162-d76694265947?w=500",
				description: "الدولمة العراقية الشهيرة بأوراق السلق والتمن العنبر واللحم المفروم والبهارات الحامضة.",
				instructions: "1. تخلط مكونات الحشوة من تمن عنبر ولحم مفروم وبهارات دولمة ومعجون.\n2. تحشى أوراق السلق والبصل.\n3. ترتب في القدر مع باقلاء خضراء أو أضلاع لحم أسفل القدر.\n4. تطبخ على نار هادئة حتى تنضج تماماً.",
				ingredients: []recIngDef{
					{"ing_minced_meat", 0.5, "unit_kg", "مفروم خشن"},
					{"ing_rice_amber", 0.75, "unit_kg", "منقوع ومغسول"},
					{"ing_chard", 2.0, "unit_pack", "مغسول ومعد للّف"},
					{"ing_onions", 0.5, "unit_kg", "مفروم ناعم للحشوة والطبقات"},
					{"ing_tomato_paste", 2.0, "unit_can", "مذاب في ماء حار مع ليمون دوزي"},
					{"ing_dolma_spices", 30.0, "unit_g", "بهارات مشكلة خاصة بالدولمة"},
					{"ing_cooking_oil", 0.1, "unit_l", "لقعر القدر والحشوة"},
				},
			},
			{
				id:          "rec_biryani",
				nameAr:      "برياني لحم عراقي",
				nameEn:      "Iraqi Meat Biryani",
				groupID:     "rg_rice",
				servings:    5,
				prepTime:    30,
				cookTime:    45,
				image:       "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500",
				description: "تمن مطبوخ مع بهارات البرياني العطرة والشعرية المحمرة وقطع لحم الغنم الطري.",
				instructions: "1. يسلق اللحم مع المطيبات حتى ينضج.\n2. تحمر الشعرية بالزيت حتى تكتسب لوناً ذهبياً.\n3. يطبخ التمن البسمتي مع ماء سلق اللحم وبهارات البرياني.\n4. تخلط المكونات وتزين باللوز والكشمش.",
				ingredients: []recIngDef{
					{"ing_lamb", 0.8, "unit_kg", "قطع متوسطة"},
					{"ing_rice_basmati", 0.6, "unit_kg", "مغسول ومنقوع"},
					{"ing_vermicelli", 1.0, "unit_pack", "محمرة"},
					{"ing_onions", 0.3, "unit_kg", "شرائح مقلية"},
					{"ing_biryani_spices", 25.0, "unit_g", "بهارات برياني أصلية"},
					{"ing_cooking_oil", 0.08, "unit_l", "للطبخ"},
				},
			},
			{
				id:          "rec_tashreeb",
				nameAr:      "تشريب لحم أحمر",
				nameEn:      "Red Meat Tashreeb",
				groupID:     "rg_iraqi",
				servings:    4,
				prepTime:    20,
				cookTime:    75,
				image:       "https://images.unsplash.com/photo-1547592180-85f173990554?w=500",
				description: "التشريب العراقي الكلاسيكي مع لحم الغنم ونومي بصرة والحمص ومعجون الطماطة.",
				instructions: "1. يحمس البصل مع قطع لحم الغنم حتى يتغير لونه.\n2. يضاف الحمص المجروش ونومي بصرة المثقوب.\n3. يضاف معجون الطماطة والماء الحار ويترك يغلي حتى ينضج اللحم تماماً.\n4. يثرد خبز الرقاق ويصب المرق واللحم فوقه.",
				ingredients: []recIngDef{
					{"ing_lamb", 0.75, "unit_kg", "لحم مع العظم"},
					{"ing_onions", 0.25, "unit_kg", "مفروم خشن"},
					{"ing_chickpeas_split", 0.2, "unit_kg", "منقوع"},
					{"ing_tomato_paste", 1.0, "unit_can", "مركز"},
					{"ing_limoo_basra", 20.0, "unit_g", "حبات مثقوبة"},
					{"ing_cooking_oil", 0.05, "unit_l", "للحمس"},
				},
			},
			{
				id:          "rec_lentil_soup",
				nameAr:      "شوربة عدس عراقية",
				nameEn:      "Iraqi Lentil Soup",
				groupID:     "rg_soups",
				servings:    4,
				prepTime:    10,
				cookTime:    25,
				image:       "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500",
				description: "شوربة العدس التقليدية مع الشعرية والبصل المحمر بطعم دافئ وشهي.",
				instructions: "1. يسلق العدس حتى يذوب تماماً ثم يخلط.\n2. تحمر الشعرية والبصل المفروم في الزيت.\n3. تضاف الشعرية والبصل للعدس وتترك لتغلي 10 دقائق.",
				ingredients: []recIngDef{
					{"ing_lentils", 0.35, "unit_kg", "مغسول ومصفى"},
					{"ing_vermicelli", 0.5, "unit_pack", "شعرية ناعمة"},
					{"ing_onions", 0.2, "unit_kg", "مفروم ناعم"},
					{"ing_cooking_oil", 0.04, "unit_l", "لتحمير البصل"},
				},
			},
			{
				id:          "rec_okra_stew",
				nameAr:      "مرقة بامية باللحم وتمن",
				nameEn:      "Okra Stew with Lamb & Rice",
				groupID:     "rg_stews",
				servings:    4,
				prepTime:    25,
				cookTime:    60,
				image:       "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500",
				description: "أحب مرق على السفرة العراقية: بامية طازجة مع الثوم ولحم الغنم وعصير الطماطة وتمن عنبر.",
				instructions: "1. يسلق اللحم ثم يحمس مع الثوم المهروس.\n2. تضاف البامية وتحمس بهدوء.\n3. يضاف معجون وعصير الطماطة وتترك تتسبك على نار هادئة دون تحريك مفرط.\n4. تقدم بجانب تمن عنبر دافئ.",
				ingredients: []recIngDef{
					{"ing_okra", 0.6, "unit_kg", "منظفة الأقماع"},
					{"ing_lamb", 0.6, "unit_kg", "قطع لحم ناعم"},
					{"ing_garlic", 0.08, "unit_kg", "فصوص ثوم صحيحة ومهروسة"},
					{"ing_tomato_paste", 1.5, "unit_can", "معجون طماطة"},
					{"ing_rice_amber", 0.5, "unit_kg", "للطبخ جانباً"},
					{"ing_cooking_oil", 0.06, "unit_l", "للطبخ"},
				},
			},
		}

		for _, r := range recipes {
			rec := models.Recipe{
				BaseModel:    models.BaseModel{ID: r.id},
				HouseholdID:  "default",
				GroupID:      r.groupID,
				NameAr:       r.nameAr,
				NameEn:       r.nameEn,
				ImageURL:     r.image,
				Description:  r.description,
				Instructions: r.instructions,
				Servings:     r.servings,
				PrepTimeMin:  r.prepTime,
				CookTimeMin:  r.cookTime,
			}
			if err := tx.Create(&rec).Error; err != nil {
				return err
			}

			for _, ingDef := range r.ingredients {
				ri := models.RecipeIngredient{
					BaseModel:    models.BaseModel{ID: uuid.NewString()},
					RecipeID:     rec.ID,
					IngredientID: ingDef.ingID,
					Quantity:     ingDef.qty,
					UnitID:       ingDef.unit,
					Notes:        ingDef.notes,
				}
				if err := tx.Create(&ri).Error; err != nil {
					return err
				}
			}
		}

		// 7. Seed Today's and This Week's Meal Plan
		todayStr := time.Now().Format("2006-01-02")
		tomorrowStr := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
		dayAfterStr := time.Now().AddDate(0, 0, 2).Format("2006-01-02")

		plan := models.MealPlan{
			BaseModel:   models.BaseModel{ID: "seed_plan_week"},
			HouseholdID: "default",
			Name:        "جدول الأسبوع الحالي",
			Type:        models.PlanWeekly,
			StartDate:   todayStr,
			EndDate:     time.Now().AddDate(0, 0, 7).Format("2006-01-02"),
		}
		if err := tx.Create(&plan).Error; err != nil {
			return err
		}

		planItems := []models.MealPlanItem{
			{BaseModel: models.BaseModel{ID: "item_today_lunch"}, MealPlanID: plan.ID, PlanDate: todayStr, Slot: models.MealLunch, RecipeID: "rec_dolma", Servings: 6, SortOrder: 1, Notes: "غداء العائلة"},
			{BaseModel: models.BaseModel{ID: "item_today_dinner"}, MealPlanID: plan.ID, PlanDate: todayStr, Slot: models.MealDinner, RecipeID: "rec_lentil_soup", Servings: 4, SortOrder: 2, Notes: "عشاء خفيف"},
			{BaseModel: models.BaseModel{ID: "item_tomorrow_lunch"}, MealPlanID: plan.ID, PlanDate: tomorrowStr, Slot: models.MealLunch, RecipeID: "rec_okra_stew", Servings: 4, SortOrder: 1, Notes: "غداء بامية وتمن"},
			{BaseModel: models.BaseModel{ID: "item_dayafter_lunch"}, MealPlanID: plan.ID, PlanDate: dayAfterStr, Slot: models.MealLunch, RecipeID: "rec_biryani", Servings: 5, SortOrder: 1, Notes: "برياني لحم"},
		}
		for _, pi := range planItems {
			if err := tx.Create(&pi).Error; err != nil {
				return err
			}
		}

		// 8. Seed Default Monthly Recurring Schedule (الجدول الشهري الثابت المتكرر)
		monthlyDishes := []struct {
			day   int
			slot  models.MealSlot
			recID string
		}{
			{1, models.MealLunch, "rec_dolma"},
			{2, models.MealLunch, "rec_biryani"},
			{3, models.MealLunch, "rec_okra_stew"},
			{4, models.MealLunch, "rec_tashreeb"},
			{5, models.MealLunch, "rec_lentil_soup"},
			{6, models.MealLunch, "rec_dolma"},
			{7, models.MealLunch, "rec_biryani"},
			{8, models.MealLunch, "rec_okra_stew"},
			{9, models.MealLunch, "rec_tashreeb"},
			{10, models.MealLunch, "rec_dolma"},
			{11, models.MealLunch, "rec_biryani"},
			{12, models.MealLunch, "rec_okra_stew"},
			{13, models.MealLunch, "rec_tashreeb"},
			{14, models.MealLunch, "rec_lentil_soup"},
			{15, models.MealLunch, "rec_dolma"},
			{16, models.MealLunch, "rec_biryani"},
			{17, models.MealLunch, "rec_okra_stew"},
			{18, models.MealLunch, "rec_tashreeb"},
			{19, models.MealLunch, "rec_dolma"},
			{20, models.MealLunch, "rec_biryani"},
			{21, models.MealLunch, "rec_okra_stew"},
			{22, models.MealLunch, "rec_tashreeb"},
			{23, models.MealLunch, "rec_dolma"},
			{24, models.MealLunch, "rec_lentil_soup"},
			{25, models.MealLunch, "rec_biryani"},
			{26, models.MealLunch, "rec_okra_stew"},
			{27, models.MealLunch, "rec_tashreeb"},
			{28, models.MealLunch, "rec_dolma"},
			{29, models.MealLunch, "rec_biryani"},
			{30, models.MealLunch, "rec_okra_stew"},
			{31, models.MealLunch, "rec_dolma"},
		}

		for _, md := range monthlyDishes {
			mItem := models.MonthlyScheduleItem{
				BaseModel:   models.BaseModel{ID: uuid.NewString()},
				HouseholdID: "default",
				DayOfMonth:  md.day,
				Slot:        md.slot,
				RecipeID:    md.recID,
				Servings:    4,
			}
			if err := tx.Create(&mItem).Error; err != nil {
				return err
			}
		}

		return nil
	})
}
