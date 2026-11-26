/* ==========================================================================
   EuLog — Ingredients Database (Per 100 g / 100 ml, SI Units)
   Separate raw & cooking ingredients database used to calculate every recipe
   strictly ingredient-by-ingredient (Calories, Protein, Carbs, Sugars, Fat,
   Salt, Fiber + 13 Vital Nutrients for Weekly tracking).
   ========================================================================== */

(function (global) {
  'use strict';

  // Tuple schema (all nutrition values strictly per 100 g or 100 ml):
  // [id, name, category, unit, defaultAmount,
  //  kcal, protein, carbs, fat, fiber, sugar, salt_g,
  //  vitA, vitC, vitD, vitE, vitK, vitB12, folate,
  //  iron, calcium, magnesium, potassium, zinc, omega3]
  const RAW_INGREDIENTS = [
    // ==================== MEAT & POULTRY ====================
    ['chicken-breast', 'Chicken Breast (Cooked)', 'Meat & Poultry', 'g', 100, 165, 31.0, 0, 3.6, 0, 0, 0.19, 6, 0, 0.1, 0.3, 0.3, 0.3, 4, 1.0, 15, 29, 256, 1.0, 0.07],
    ['chicken-thigh', 'Chicken Thigh (Cooked)', 'Meat & Poultry', 'g', 100, 179, 24.8, 0, 8.2, 0, 0, 0.24, 21, 0, 0.1, 0.3, 2.4, 0.6, 8, 1.0, 11, 24, 269, 2.0, 0.10],
    ['turkey-breast', 'Turkey Breast (Cooked)', 'Meat & Poultry', 'g', 100, 147, 30.1, 0, 2.1, 0, 0, 0.25, 8, 0, 0.2, 0.1, 0, 1.0, 8, 0.7, 14, 32, 244, 1.7, 0.04],
    ['ground-beef', 'Ground Beef (Lean Cooked)', 'Meat & Poultry', 'g', 100, 193, 26.1, 0, 9.0, 0, 0, 0.19, 3, 0, 0.1, 0.2, 1.3, 2.6, 9, 2.7, 13, 23, 345, 6.3, 0.05],
    ['beef-stew', 'Beef / Veal (Braised)', 'Meat & Poultry', 'g', 100, 183, 27.3, 0, 7.4, 0, 0, 0.16, 2, 0, 0.2, 0.4, 1.4, 2.1, 10, 2.4, 18, 25, 355, 5.2, 0.06],
    ['pork-gyros', 'Pork Gyros / Shoulder (Cooked)', 'Meat & Poultry', 'g', 100, 212, 24.5, 0.5, 12.2, 0, 0.2, 1.15, 2, 0, 0.5, 0.2, 0, 0.7, 2, 1.1, 12, 24, 340, 2.5, 0.04],
    ['pork-tenderloin', 'Pork Tenderloin (Cooked)', 'Meat & Poultry', 'g', 100, 143, 26.2, 0, 3.5, 0, 0, 0.14, 2, 0, 0.4, 0.2, 0, 0.5, 0, 1.1, 6, 30, 410, 2.3, 0.04],
    ['lamb-meat', 'Lamb (Lean Cooked)', 'Meat & Poultry', 'g', 100, 205, 28.1, 0, 9.6, 0, 0, 0.19, 0, 0, 0.1, 0.2, 4.4, 2.5, 20, 2.1, 16, 26, 327, 4.6, 0.11],
    ['bacon', 'Bacon (Cooked)', 'Meat & Poultry', 'g', 20, 538, 36.9, 1.3, 41.9, 0, 0, 4.28, 12, 0, 0.6, 0.6, 0, 1.2, 0, 1.2, 12, 31, 563, 3.7, 0.19],
    ['deli-ham', 'Ham / Deli Turkey', 'Meat & Poultry', 'g', 40, 125, 19.5, 2.5, 3.8, 0, 1.4, 2.25, 0, 0, 0.2, 0.1, 0, 0.6, 5, 0.8, 10, 20, 260, 1.6, 0.03],
    ['greek-sausage', 'Greek Sausage (Loukaniko)', 'Meat & Poultry', 'g', 80, 301, 16.5, 2.4, 25.0, 0, 1.0, 2.10, 4, 1, 0.5, 0.3, 0, 1.1, 4, 1.4, 18, 18, 280, 2.3, 0.06],

    // ==================== FISH & SEAFOOD ====================
    ['salmon', 'Salmon (Cooked)', 'Fish & Seafood', 'g', 120, 206, 22.1, 0, 12.4, 0, 0, 0.15, 69, 3.7, 13.2, 1.1, 0.1, 2.8, 34, 0.4, 15, 30, 384, 0.4, 2.17],
    ['white-fish', 'White Fish / Cod / Sea Bream', 'Fish & Seafood', 'g', 120, 105, 22.0, 0, 1.4, 0, 0, 0.18, 14, 0.8, 2.2, 0.8, 0.1, 1.4, 9, 0.4, 18, 34, 420, 0.6, 0.30],
    ['sardines', 'Sardines (in Olive Oil)', 'Fish & Seafood', 'g', 90, 208, 24.6, 0, 11.4, 0, 0, 0.76, 32, 0, 4.8, 2.0, 2.6, 8.9, 10, 2.9, 382, 39, 397, 1.3, 1.48],
    ['tuna-water', 'Tuna (in Water, Drained)', 'Fish & Seafood', 'g', 85, 86, 19.4, 0, 0.9, 0, 0, 0.62, 6, 0, 2.0, 0.2, 0.1, 2.9, 4, 1.6, 18, 22, 179, 0.8, 0.28],
    ['shrimp', 'Shrimp / Prawns (Cooked)', 'Fish & Seafood', 'g', 100, 99, 20.9, 1.5, 1.0, 0, 0, 0.30, 90, 0, 0.1, 2.2, 0.4, 1.7, 24, 0.5, 70, 39, 259, 1.7, 0.31],
    ['squid-calamari', 'Squid / Calamari (Cooked)', 'Fish & Seafood', 'g', 100, 115, 18.0, 3.5, 2.4, 0, 0, 0.35, 12, 4.0, 0, 1.2, 0, 1.5, 6, 0.8, 35, 36, 270, 1.7, 0.50],
    ['octopus', 'Octopus (Cooked)', 'Fish & Seafood', 'g', 100, 128, 23.0, 3.4, 1.8, 0, 0, 0.92, 45, 5.0, 0, 1.2, 0.1, 18.0, 20, 6.2, 68, 44, 420, 2.4, 0.32],
    ['mussels', 'Mussels (Cooked)', 'Fish & Seafood', 'g', 85, 172, 23.8, 7.4, 4.5, 0, 0, 0.92, 91, 13.6, 0, 0.9, 0.2, 24.0, 76, 6.7, 33, 36, 268, 2.7, 0.80],

    // ==================== DAIRY & EGGS ====================
    ['whole-egg', 'Whole Egg', 'Dairy & Eggs', 'g', 50, 147, 12.6, 0.8, 9.9, 0, 0.4, 0.35, 160, 0, 2.2, 1.1, 0.3, 1.1, 44, 1.7, 50, 10, 126, 1.1, 0.08],
    ['egg-white', 'Egg White', 'Dairy & Eggs', 'g', 66, 52, 10.9, 0.7, 0.2, 0, 0.7, 0.42, 0, 0, 0, 0, 0, 0.1, 4, 0.1, 7, 11, 163, 0, 0],
    ['feta-cheese', 'Feta Cheese', 'Dairy & Eggs', 'g', 30, 264, 14.2, 4.1, 21.3, 0, 4.1, 2.79, 125, 0, 0.4, 0.2, 1.8, 1.7, 32, 0.7, 493, 19, 62, 2.9, 0.25],
    ['kefalotyri-parmesan', 'Kefalotyri / Parmesan (Grated)', 'Dairy & Eggs', 'g', 15, 392, 35.8, 3.2, 25.8, 0, 0.9, 3.80, 240, 0, 0.5, 0.5, 1.7, 1.4, 7, 0.8, 1109, 38, 125, 3.2, 0.20],
    ['kasseri-cheese', 'Kasseri / Graviera / Cheddar', 'Dairy & Eggs', 'g', 30, 385, 24.5, 2.0, 31.2, 0, 0.6, 1.75, 280, 0, 0.5, 0.6, 2.4, 1.1, 22, 0.4, 720, 28, 88, 3.4, 0.25],
    ['mozzarella', 'Mozzarella Cheese', 'Dairy & Eggs', 'g', 30, 280, 22.2, 2.2, 20.0, 0, 1.0, 1.56, 174, 0, 0.4, 0.4, 2.1, 2.1, 7, 0.4, 505, 20, 76, 2.9, 0.28],
    ['halloumi', 'Halloumi Cheese', 'Dairy & Eggs', 'g', 50, 321, 22.0, 2.6, 25.0, 0, 1.8, 2.60, 190, 0, 0.4, 0.3, 1.8, 1.4, 18, 0.4, 700, 24, 90, 3.0, 0.20],
    ['ricotta-anthotyro', 'Anthotyro / Ricotta / Mizithra', 'Dairy & Eggs', 'g', 50, 155, 11.4, 4.2, 10.2, 0, 1.8, 0.45, 115, 0, 0.2, 0.2, 0.7, 0.4, 14, 0.4, 270, 14, 125, 1.3, 0.10],
    ['greek-yogurt-2', 'Greek Yogurt (2%)', 'Dairy & Eggs', 'g', 100, 73, 9.9, 3.9, 1.9, 0, 3.6, 0.09, 22, 0, 0.1, 0.1, 0.2, 0.6, 7, 0.1, 115, 11, 141, 0.5, 0.02],
    ['greek-yogurt-full', 'Greek Yogurt (Full-Fat 10%)', 'Dairy & Eggs', 'g', 100, 130, 6.2, 4.0, 10.0, 0, 3.8, 0.09, 92, 0, 0.2, 0.2, 0.7, 0.6, 7, 0.1, 110, 11, 141, 0.5, 0.08],
    ['whole-milk', 'Whole Milk', 'Dairy & Eggs', 'ml', 100, 61, 3.2, 4.8, 3.3, 0, 5.0, 0.11, 46, 0, 1.3, 0.1, 0.3, 0.5, 5, 0, 113, 10, 132, 0.4, 0.07],
    ['skim-milk', 'Skim Milk', 'Dairy & Eggs', 'ml', 100, 34, 3.4, 5.0, 0.1, 0, 5.1, 0.11, 61, 0, 1.2, 0, 0, 0.5, 5, 0, 122, 11, 156, 0.4, 0],
    ['heavy-cream', 'Cooking Cream', 'Dairy & Eggs', 'ml', 30, 290, 2.5, 3.0, 30.0, 0, 3.0, 0.10, 310, 0.5, 0.4, 0.8, 2.5, 0.2, 4, 0.1, 70, 7, 90, 0.2, 0.15],
    ['butter', 'Butter (Unsalted)', 'Dairy & Eggs', 'g', 10, 717, 0.9, 0.1, 81.1, 0, 0.1, 0.03, 684, 0, 0, 2.3, 7.0, 0.2, 3, 0, 24, 2, 24, 0.1, 0.32],
    ['bechamel-sauce', 'Béchamel Sauce', 'Dairy & Eggs', 'g', 65, 168, 5.0, 12.2, 11.2, 0.3, 4.2, 0.82, 110, 0, 0.3, 0.3, 0.8, 0.3, 10, 0.4, 125, 12, 140, 0.5, 0.05],
    ['tzatziki', 'Tzatziki', 'Dairy & Eggs', 'g', 40, 125, 5.8, 4.4, 9.4, 0.5, 3.4, 0.65, 55, 2.5, 0.1, 0.5, 3.0, 0.3, 10, 0.2, 102, 12, 165, 0.4, 0.06],

    // ==================== VEGETABLES ====================
    ['tomato', 'Tomato (Fresh)', 'Vegetables', 'g', 80, 18, 0.9, 3.9, 0.2, 1.2, 2.6, 0.01, 42, 13.7, 0, 0.5, 7.9, 0, 15, 0.3, 10, 11, 237, 0.2, 0],
    ['tomato-sauce', 'Tomato Sauce / Passata', 'Vegetables', 'g', 80, 38, 1.5, 7.0, 0.6, 1.6, 4.5, 0.72, 45, 12.5, 0, 1.4, 3.0, 0, 12, 0.9, 18, 18, 350, 0.2, 0.02],
    ['tomato-paste', 'Tomato Paste', 'Vegetables', 'g', 15, 82, 4.3, 18.9, 0.5, 4.1, 12.2, 0.15, 76, 21.9, 0, 4.3, 11.4, 0, 12, 3.0, 36, 42, 1014, 0.6, 0.03],
    ['cucumber', 'Cucumber', 'Vegetables', 'g', 60, 15, 0.7, 3.6, 0.1, 0.5, 1.7, 0.01, 5, 2.8, 0, 0, 16.4, 0, 7, 0.3, 16, 13, 147, 0.2, 0.01],
    ['red-onion', 'Red Onion', 'Vegetables', 'g', 35, 40, 1.1, 9.3, 0.1, 1.7, 4.2, 0.01, 0, 7.4, 0, 0, 0.4, 0, 19, 0.2, 23, 10, 146, 0.2, 0],
    ['onion', 'Yellow Onion', 'Vegetables', 'g', 40, 40, 1.1, 9.3, 0.1, 1.7, 4.2, 0.01, 0, 7.4, 0, 0, 0.4, 0, 19, 0.2, 23, 10, 146, 0.2, 0],
    ['scallions', 'Scallions (Spring Onion)', 'Vegetables', 'g', 20, 32, 1.8, 7.3, 0.2, 2.6, 2.3, 0.04, 50, 18.8, 0, 0.6, 207, 0, 64, 1.5, 72, 20, 276, 0.4, 0.02],
    ['garlic', 'Garlic', 'Vegetables', 'g', 6, 149, 6.4, 33.1, 0.5, 2.1, 1.0, 0.04, 0, 31.2, 0, 0.1, 1.7, 0, 3, 1.7, 181, 25, 401, 1.2, 0.02],
    ['carrots', 'Carrots', 'Vegetables', 'g', 50, 41, 0.9, 9.6, 0.2, 2.8, 4.7, 0.17, 835, 5.9, 0, 0.7, 13.2, 0, 19, 0.3, 33, 12, 320, 0.2, 0],
    ['celery', 'Celery', 'Vegetables', 'g', 40, 14, 0.7, 3.0, 0.2, 1.6, 1.3, 0.20, 22, 3.1, 0, 0.3, 29.3, 0, 36, 0.2, 40, 11, 260, 0.1, 0],
    ['potatoes', 'Potatoes (Baked / Boiled)', 'Vegetables', 'g', 100, 87, 1.9, 20.1, 0.1, 1.8, 0.9, 0.02, 0, 12.8, 0, 0, 2.2, 0, 18, 0.3, 5, 22, 379, 0.3, 0.01],
    ['sweet-potato', 'Sweet Potato (Baked)', 'Vegetables', 'g', 100, 90, 2.0, 20.7, 0.2, 3.3, 6.5, 0.09, 961, 19.6, 0, 0.7, 2.3, 0, 6, 0.7, 38, 27, 475, 0.3, 0.01],
    ['eggplant', 'Eggplant (Roasted)', 'Vegetables', 'g', 90, 35, 0.8, 8.7, 0.2, 2.5, 3.2, 0.01, 2, 1.3, 0, 0.4, 2.9, 0, 14, 0.2, 6, 11, 123, 0.1, 0],
    ['zucchini', 'Zucchini (Cooked)', 'Vegetables', 'g', 90, 15, 1.2, 2.7, 0.3, 1.0, 1.7, 0.01, 56, 12.9, 0, 0.1, 4.2, 0, 28, 0.4, 18, 19, 264, 0.3, 0.04],
    ['bell-pepper', 'Bell Pepper (Red/Green)', 'Vegetables', 'g', 60, 31, 1.0, 6.0, 0.3, 2.1, 4.2, 0.01, 157, 128, 0, 1.6, 4.9, 0, 46, 0.4, 7, 12, 211, 0.3, 0.03],
    ['spinach', 'Spinach (Fresh / Cooked)', 'Vegetables', 'g', 60, 23, 2.9, 3.6, 0.4, 2.2, 0.4, 0.20, 469, 28.1, 0, 2.0, 483, 0, 194, 2.7, 99, 79, 558, 0.5, 0.14],
    ['lettuce', 'Romaine Lettuce', 'Vegetables', 'g', 60, 17, 1.2, 3.3, 0.3, 2.1, 1.2, 0.02, 436, 4.0, 0, 0.1, 102, 0, 136, 1.0, 33, 14, 247, 0.2, 0.11],
    ['cabbage', 'Cabbage', 'Vegetables', 'g', 70, 25, 1.3, 5.8, 0.1, 2.5, 3.2, 0.05, 5, 36.6, 0, 0.2, 76, 0, 43, 0.5, 40, 12, 170, 0.2, 0],
    ['broccoli', 'Broccoli (Steamed)', 'Vegetables', 'g', 90, 35, 2.4, 7.2, 0.4, 3.3, 1.4, 0.10, 77, 64.9, 0, 1.5, 141, 0, 108, 0.7, 40, 21, 293, 0.5, 0.13],
    ['green-peas', 'Green Peas (Cooked)', 'Vegetables', 'g', 80, 84, 5.4, 15.6, 0.2, 5.5, 5.9, 0.01, 40, 14.2, 0, 0.1, 25.9, 0, 63, 1.5, 27, 39, 271, 1.2, 0.03],
    ['green-beans', 'Green Beans (Cooked)', 'Vegetables', 'g', 90, 35, 1.9, 7.9, 0.3, 3.2, 3.6, 0.01, 35, 9.7, 0, 0.5, 48, 0, 33, 0.6, 44, 18, 146, 0.2, 0.04],
    ['artichokes', 'Artichoke Hearts', 'Vegetables', 'g', 80, 47, 3.3, 10.5, 0.2, 5.4, 1.0, 0.24, 1, 11.7, 0, 0.2, 14.8, 0, 68, 1.3, 44, 60, 370, 0.5, 0.02],
    ['okra', 'Okra (Bamies)', 'Vegetables', 'g', 90, 33, 1.9, 7.5, 0.2, 3.2, 1.5, 0.02, 36, 23.0, 0, 0.3, 31.3, 0, 60, 0.6, 82, 57, 299, 0.6, 0.02],
    ['mushrooms', 'Mushrooms (Cooked)', 'Vegetables', 'g', 70, 28, 2.2, 5.3, 0.5, 2.2, 2.4, 0.01, 0, 4.0, 0.3, 0, 0, 0.1, 18, 1.7, 6, 12, 356, 0.9, 0],
    ['avocado', 'Avocado', 'Vegetables', 'g', 60, 160, 2.0, 8.5, 14.7, 6.7, 0.7, 0.02, 7, 10.0, 0, 2.1, 21, 0, 81, 0.6, 12, 29, 485, 0.6, 0.11],
    ['sweet-corn', 'Sweet Corn', 'Vegetables', 'g', 60, 86, 3.3, 19.0, 1.4, 2.4, 4.5, 0.01, 13, 5.5, 0, 0.1, 0.4, 0, 23, 0.5, 3, 26, 218, 0.6, 0.02],
    ['horta-greens', 'Wild Greens (Horta / Dandelion)', 'Vegetables', 'g', 100, 35, 2.4, 6.4, 0.6, 3.0, 0.7, 0.15, 420, 24.0, 0, 2.5, 480, 0, 95, 2.4, 150, 36, 360, 0.4, 0.12],
    ['leeks', 'Leeks (Prasso)', 'Vegetables', 'g', 70, 31, 0.8, 7.6, 0.2, 1.0, 2.1, 0.03, 41, 4.2, 0, 0.5, 25.4, 0, 24, 1.1, 30, 14, 87, 0.1, 0.01],

    // ==================== HERBS, SPICES & SEASONINGS ====================
    ['fresh-dill', 'Fresh Dill', 'Herbs & Spices', 'g', 5, 43, 3.5, 7.0, 1.1, 2.1, 0, 0.15, 386, 85.0, 0, 0, 240, 0, 150, 6.6, 208, 55, 738, 0.9, 0],
    ['fresh-parsley', 'Fresh Parsley', 'Herbs & Spices', 'g', 5, 36, 3.0, 6.3, 0.8, 3.3, 0.9, 0.14, 421, 133, 0, 0.8, 1640, 0, 152, 6.2, 138, 50, 554, 1.1, 0.01],
    ['fresh-mint', 'Fresh Mint', 'Herbs & Spices', 'g', 5, 44, 3.3, 8.4, 0.7, 6.8, 0, 0.08, 212, 31.8, 0, 0, 0, 0, 114, 5.1, 243, 80, 569, 1.1, 0.20],
    ['fresh-cilantro', 'Fresh Cilantro', 'Herbs & Spices', 'g', 5, 23, 2.1, 3.7, 0.5, 2.8, 0.9, 0.12, 337, 27.0, 0, 2.5, 310, 0, 62, 1.8, 67, 26, 521, 0.5, 0],
    ['dried-oregano', 'Dried Oregano', 'Herbs & Spices', 'g', 2, 265, 9.0, 68.9, 4.3, 42.5, 4.1, 0.06, 85, 2.3, 0, 18.3, 622, 0, 237, 36.8, 1597, 270, 1260, 2.7, 0.62],
    ['cinnamon', 'Cinnamon', 'Herbs & Spices', 'g', 2, 247, 4.0, 80.6, 1.2, 53.1, 2.2, 0.03, 15, 3.8, 0, 2.3, 31.2, 0, 6, 8.3, 1002, 60, 431, 1.8, 0.01],
    ['capers', 'Capers', 'Herbs & Spices', 'g', 10, 23, 2.4, 4.9, 0.9, 3.2, 0.4, 5.88, 7, 4.3, 0, 0.9, 24.6, 0, 23, 1.7, 40, 33, 40, 0.3, 0],
    ['table-salt', 'Salt (Sea / Table)', 'Herbs & Spices', 'g', 1, 0, 0, 0, 0, 0, 0, 100.0, 0, 0, 0, 0, 0, 0, 0, 0.3, 24, 1, 8, 0.1, 0],

    // ==================== GRAINS, PASTA & BREAD ====================
    ['white-rice-cooked', 'White Rice (Cooked)', 'Grains & Bread', 'g', 80, 130, 2.7, 28.2, 0.3, 0.4, 0.1, 0.01, 0, 0, 0, 0, 0, 0, 58, 1.2, 10, 12, 35, 0.5, 0.01],
    ['brown-rice-cooked', 'Brown Rice (Cooked)', 'Grains & Bread', 'g', 80, 123, 2.7, 25.6, 1.0, 1.6, 0.2, 0.01, 0, 0, 0, 0.2, 0.2, 0, 9, 0.6, 3, 39, 86, 0.7, 0.01],
    ['pasta-cooked', 'Pasta / Spaghetti (Cooked)', 'Grains & Bread', 'g', 120, 158, 5.8, 30.9, 0.9, 1.8, 0.6, 0.01, 0, 0, 0, 0.1, 0, 0, 73, 1.3, 7, 18, 44, 0.5, 0.01],
    ['orzo-cooked', 'Orzo / Kritharaki (Cooked)', 'Grains & Bread', 'g', 110, 155, 5.5, 30.2, 0.9, 1.6, 0.7, 0.02, 0, 0, 0, 0.1, 0, 0, 68, 1.2, 8, 18, 45, 0.5, 0.01],
    ['pita-bread', 'Greek Pita Bread', 'Grains & Bread', 'g', 75, 270, 9.2, 54.5, 2.6, 2.6, 2.8, 1.28, 0, 0, 0, 0.2, 0.3, 0, 82, 2.6, 84, 28, 125, 0.9, 0.04],
    ['village-bread', 'Bread (Village / Sourdough)', 'Grains & Bread', 'g', 45, 265, 9.0, 50.5, 2.2, 2.8, 2.6, 1.35, 0, 0, 0, 0.2, 0.4, 0, 80, 2.8, 42, 28, 130, 0.9, 0.03],
    ['barley-rusk', 'Barley Rusk (Dakos / Paximadi)', 'Grains & Bread', 'g', 50, 355, 11.0, 69.0, 3.2, 9.5, 2.4, 1.20, 0, 0, 0, 0.4, 0.5, 0, 40, 3.2, 48, 72, 290, 1.8, 0.08],
    ['phyllo-pastry', 'Phyllo Pastry', 'Grains & Bread', 'g', 45, 299, 7.1, 52.6, 6.0, 1.9, 0.5, 1.21, 0, 0, 0, 0.6, 4.0, 0, 88, 3.1, 11, 16, 108, 0.4, 0.06],
    ['rolled-oats', 'Rolled Oats (Dry)', 'Grains & Bread', 'g', 40, 389, 16.9, 66.3, 6.9, 10.6, 1.0, 0.01, 0, 0, 0, 0.4, 2.0, 0, 56, 4.7, 54, 177, 429, 4.0, 0.11],
    ['quinoa-cooked', 'Quinoa (Cooked)', 'Grains & Bread', 'g', 90, 120, 4.4, 21.3, 1.9, 2.8, 0.9, 0.02, 0, 0, 0, 0.6, 0, 0, 42, 1.5, 17, 64, 172, 1.1, 0.04],
    ['french-fries', 'French Fries (Fried Potatoes)', 'Grains & Bread', 'g', 80, 312, 3.4, 41.4, 14.7, 3.8, 0.3, 0.53, 0, 4.7, 0, 1.7, 11.2, 0, 30, 0.8, 18, 35, 579, 0.5, 0.04],
    ['granola', 'Granola', 'Grains & Bread', 'g', 35, 458, 11.0, 62.5, 18.5, 7.8, 18.0, 0.25, 0, 0, 0, 2.2, 2.0, 0, 45, 3.6, 56, 124, 430, 2.8, 0.35],
    ['burger-bun', 'Burger Bun / Brioche', 'Grains & Bread', 'g', 55, 285, 9.4, 49.5, 5.2, 2.1, 6.5, 1.25, 15, 0, 0, 0.3, 1.0, 0.1, 88, 3.0, 110, 24, 130, 0.8, 0.04],

    // ==================== LEGUMES, NUTS & SEEDS ====================
    ['white-beans', 'White Beans / Fasolia (Cooked)', 'Legumes & Nuts', 'g', 120, 139, 9.7, 25.1, 0.4, 6.3, 0.3, 0.01, 0, 0, 0, 0.9, 3.5, 0, 81, 3.7, 90, 63, 561, 1.4, 0.07],
    ['lentils-cooked', 'Lentils / Fakes (Cooked)', 'Legumes & Nuts', 'g', 130, 116, 9.0, 20.1, 0.4, 7.9, 1.8, 0.01, 0, 1.5, 0, 0.1, 1.7, 0, 181, 3.3, 19, 36, 369, 1.3, 0.04],
    ['chickpeas-cooked', 'Chickpeas / Revithia (Cooked)', 'Legumes & Nuts', 'g', 120, 164, 8.9, 27.4, 2.6, 7.6, 4.8, 0.02, 1, 1.3, 0, 0.4, 4.0, 0, 172, 2.9, 49, 48, 291, 1.5, 0.04],
    ['split-peas-fava', 'Yellow Split Peas / Fava (Cooked)', 'Legumes & Nuts', 'g', 120, 118, 8.3, 21.1, 0.4, 8.3, 2.9, 0.01, 1, 0.4, 0, 0.1, 5.0, 0, 65, 1.3, 14, 36, 362, 1.0, 0.03],
    ['black-beans', 'Black Beans (Cooked)', 'Legumes & Nuts', 'g', 100, 132, 8.9, 23.7, 0.5, 8.7, 0.3, 0.01, 0, 0, 0, 0.9, 3.3, 0, 149, 2.1, 27, 70, 355, 1.1, 0.10],
    ['walnuts', 'Walnuts', 'Legumes & Nuts', 'g', 20, 654, 15.2, 13.7, 65.2, 6.7, 2.6, 0.01, 1, 1.3, 0, 0.7, 2.7, 0, 98, 2.9, 98, 158, 441, 3.1, 9.08],
    ['almonds', 'Almonds', 'Legumes & Nuts', 'g', 20, 579, 21.2, 21.6, 49.9, 12.5, 4.4, 0.01, 0, 0, 0, 25.6, 0, 0, 44, 3.7, 269, 270, 733, 3.1, 0.01],
    ['tahini', 'Tahini (Sesame Paste)', 'Legumes & Nuts', 'g', 20, 595, 17.0, 21.2, 53.8, 9.3, 0.5, 0.29, 3, 0, 0, 0.3, 0, 0, 98, 9.0, 426, 95, 414, 4.6, 0.38],
    ['kalamata-olives', 'Kalamata Olives', 'Legumes & Nuts', 'g', 25, 198, 1.6, 5.5, 19.2, 3.3, 0.5, 3.85, 20, 0, 0, 3.4, 1.4, 0, 0, 3.0, 88, 11, 42, 0.2, 0.09],
    ['peanut-butter', 'Peanut Butter', 'Legumes & Nuts', 'g', 20, 588, 25.1, 20.0, 50.4, 6.0, 9.2, 1.08, 0, 0, 0, 9.1, 0.3, 0, 74, 1.9, 43, 154, 649, 2.9, 0.01],

    // ==================== OILS, SAUCES & BROTHS ====================
    ['olive-oil', 'Extra Virgin Olive Oil', 'Oils & Sauces', 'ml', 15, 884, 0, 0, 100.0, 0, 0, 0, 0, 0, 0, 14.4, 60.2, 0, 0, 0.6, 1, 0, 1, 0, 0.76],
    ['lemon-juice', 'Fresh Lemon Juice', 'Oils & Sauces', 'ml', 20, 22, 0.4, 6.9, 0.2, 0.3, 2.5, 0.01, 0, 38.7, 0, 0.2, 0, 0, 20, 0.1, 6, 6, 103, 0.1, 0],
    ['red-wine-vinegar', 'Red Wine / Balsamic Vinegar', 'Oils & Sauces', 'ml', 10, 19, 0, 0.3, 0, 0, 0.1, 0.02, 0, 0.5, 0, 0, 0, 0, 0, 0.4, 6, 4, 39, 0.1, 0],
    ['mayo-dressing', 'Mayonnaise / Creamy Dressing', 'Oils & Sauces', 'g', 20, 620, 1.0, 3.5, 68.0, 0, 1.5, 1.50, 25, 0, 0.2, 5.5, 95, 0.1, 6, 0.2, 12, 2, 24, 0.2, 3.50],
    ['mustard-sauce', 'Mustard / Honey-Mustard Sauce', 'Oils & Sauces', 'g', 25, 195, 3.8, 14.0, 13.5, 1.5, 9.5, 2.15, 10, 1.0, 0, 1.2, 12, 0, 10, 1.0, 35, 22, 110, 0.4, 0.50],
    ['pesto', 'Basil Pesto', 'Oils & Sauces', 'g', 30, 440, 5.0, 6.0, 44.0, 1.8, 1.5, 1.95, 140, 4.0, 0, 6.5, 110, 0.1, 22, 1.2, 145, 32, 150, 0.8, 0.35],
    ['chicken-broth', 'Chicken / Vegetable Broth', 'Oils & Sauces', 'ml', 200, 12, 1.6, 0.6, 0.3, 0, 0.3, 0.62, 0, 0, 0, 0, 0, 0, 2, 0.2, 4, 2, 65, 0.1, 0],
    ['beef-broth', 'Beef Broth', 'Oils & Sauces', 'ml', 200, 15, 2.2, 0.5, 0.4, 0, 0.2, 0.68, 0, 0, 0, 0, 0, 0.1, 2, 0.2, 5, 3, 75, 0.2, 0],
    ['soy-sauce', 'Soy Sauce', 'Oils & Sauces', 'ml', 15, 53, 8.1, 4.9, 0.6, 0.8, 0.4, 13.73, 0, 0, 0, 0, 0, 0, 14, 1.5, 33, 74, 435, 0.9, 0],
    ['white-wine', 'Cooking Wine (Evaporated)', 'Oils & Sauces', 'ml', 30, 35, 0.1, 2.6, 0, 0, 1.0, 0.01, 0, 0, 0, 0, 0, 0, 1, 0.3, 9, 10, 71, 0.1, 0],

    // ==================== FRUITS ====================
    ['banana', 'Banana', 'Fruits', 'g', 118, 89, 1.1, 22.8, 0.3, 2.6, 12.2, 0.01, 3, 8.7, 0, 0.1, 0.5, 0, 20, 0.3, 5, 27, 358, 0.2, 0.03],
    ['apple', 'Apple', 'Fruits', 'g', 150, 52, 0.3, 13.8, 0.2, 2.4, 10.4, 0.01, 3, 4.6, 0, 0.2, 2.2, 0, 3, 0.1, 6, 5, 107, 0.1, 0.01],
    ['orange', 'Orange', 'Fruits', 'g', 130, 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, 11, 53.2, 0, 0.2, 0, 0, 30, 0.1, 40, 10, 181, 0.1, 0.01],
    ['berries', 'Mixed Berries (Strawberries / Blueberries)', 'Fruits', 'g', 75, 45, 0.8, 11.0, 0.3, 2.4, 7.2, 0.01, 2, 36.0, 0, 0.4, 10.5, 0, 15, 0.4, 12, 10, 120, 0.1, 0.06],
    ['raisins-dates', 'Raisins / Dried Fruit', 'Fruits', 'g', 25, 299, 3.1, 79.2, 0.5, 3.7, 59.2, 0.03, 0, 2.3, 0, 0.1, 3.5, 0, 5, 1.9, 50, 32, 749, 0.2, 0],

    // ==================== SWEETS & DRINKS ====================
    ['honey', 'Greek Honey', 'Sweets & Drinks', 'g', 15, 304, 0.3, 82.4, 0, 0.2, 82.1, 0.01, 0, 0.5, 0, 0, 0, 0, 2, 0.4, 6, 2, 52, 0.2, 0],
    ['white-sugar', 'Sugar / Syrup', 'Sweets & Drinks', 'g', 10, 387, 0, 100.0, 0, 0, 99.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0],
    ['dark-chocolate', 'Dark Chocolate (70%)', 'Sweets & Drinks', 'g', 20, 598, 7.8, 45.9, 42.6, 10.9, 24.0, 0.05, 2, 0, 0, 0.6, 7.3, 0.3, 12, 11.9, 73, 228, 715, 3.3, 0.03],
    ['chocolate-praline', 'Chocolate Hazelnut Praline', 'Sweets & Drinks', 'g', 25, 539, 6.3, 57.5, 30.9, 3.4, 56.3, 0.11, 0, 0, 0, 4.0, 2.0, 0.1, 18, 3.2, 110, 65, 390, 1.1, 0.04],
    ['custard-cream', 'Vanilla Custard / Bougatsa Cream', 'Sweets & Drinks', 'g', 80, 145, 3.5, 21.5, 5.2, 0.2, 15.8, 0.18, 65, 0, 0.3, 0.2, 0.5, 0.3, 8, 0.3, 98, 10, 120, 0.4, 0.04],
    ['espresso-coffee', 'Espresso Coffee', 'Sweets & Drinks', 'ml', 60, 2, 0.1, 0, 0.2, 0, 0, 0.03, 0, 0, 0, 0, 0.1, 0, 1, 0.1, 2, 8, 115, 0.1, 0],
    ['whey-protein', 'Whey Protein Powder', 'Sweets & Drinks', 'g', 30, 400, 80.0, 10.0, 5.0, 0, 3.3, 0.42, 0, 0, 0, 0, 0, 1.7, 0, 1.7, 400, 67, 533, 0.7, 0],
  ];

  const INGREDIENTS_DB = RAW_INGREDIENTS.map((r) => ({
    id: r[0],
    name: r[1],
    category: r[2],
    unit: r[3], // 'g' or 'ml'
    defaultAmount: r[4],
    calories: r[5],
    protein: r[6],
    carbs: r[7],
    fat: r[8],
    fiber: r[9],
    sugar: r[10],
    salt: r[11], // g per 100 g/ml (SI)
    nutrients: {
      vitA: r[12],
      vitC: r[13],
      vitD: r[14],
      vitE: r[15],
      vitK: r[16],
      vitB12: r[17],
      folate: r[18],
      iron: r[19],
      calcium: r[20],
      magnesium: r[21],
      potassium: r[22],
      zinc: r[23],
      omega3: r[24],
      sodium: Math.round((r[11] / 2.5) * 1000),
    },
  }));

  const INGREDIENTS_BY_ID = Object.fromEntries(INGREDIENTS_DB.map((ing) => [ing.id, ing]));

  const INGREDIENT_CATEGORIES = [
    'All',
    ...Array.from(new Set(INGREDIENTS_DB.map((ing) => ing.category))),
  ];

  function computeIngredientNutrition(ing, amount) {
    const qty = Math.max(0, Number(amount) || 0);
    const ratio = qty / 100;
    const nuts = {};
    for (const [k, v] of Object.entries(ing?.nutrients || {})) {
      nuts[k] = Number(((Number(v) || 0) * ratio).toFixed(2));
    }
    return {
      calories: Number(((Number(ing?.calories) || 0) * ratio).toFixed(1)),
      protein: Number(((Number(ing?.protein) || 0) * ratio).toFixed(2)),
      carbs: Number(((Number(ing?.carbs) || 0) * ratio).toFixed(2)),
      fat: Number(((Number(ing?.fat) || 0) * ratio).toFixed(2)),
      fiber: Number(((Number(ing?.fiber) || 0) * ratio).toFixed(2)),
      sugar: Number(((Number(ing?.sugar) || 0) * ratio).toFixed(2)),
      salt: Number(((Number(ing?.salt) || 0) * ratio).toFixed(2)),
      nutrients: nuts,
    };
  }

  global.EuLogIngredients = {
    INGREDIENTS_DB,
    INGREDIENTS_BY_ID,
    INGREDIENT_CATEGORIES,
    computeIngredientNutrition,
  };
})(window);
