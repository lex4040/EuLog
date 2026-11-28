/* ==========================================================================
   EuLog — Ingredient-by-Ingredient Recipe Engine
   Decomposes every food across all 2,154 dishes into editable SI ingredients
   referencing EuLogIngredients (per 100 g / 100 ml), calculates all macros
   (Calories, Protein, Carbs, Sugars, Fat, Salt, Fiber) & weekly micronutrients
   strictly from the sum of its ingredients, and builds clean macro descriptions.
   ========================================================================== */

(function (global) {
  'use strict';

  const { INGREDIENTS_DB, INGREDIENTS_BY_ID, computeIngredientNutrition } = global.EuLogIngredients;

  // Hand-crafted authentic SI ingredient breakdowns for signature Greek & global recipes
  // Each entry: [ingredientId, amountInGramsOrMl]
  const CURATED_RECIPES = {
    avgolemono: [
      ['chicken-breast', 90],
      ['white-rice-cooked', 65],
      ['whole-egg', 50],
      ['lemon-juice', 25],
      ['fresh-dill', 5],
      ['chicken-broth', 220],
      ['olive-oil', 5],
      ['table-salt', 1.2],
    ],
    moussaka: [
      ['eggplant', 110],
      ['ground-beef', 90],
      ['potatoes', 70],
      ['bechamel-sauce', 75],
      ['tomato-sauce', 55],
      ['onion', 25],
      ['olive-oil', 15],
      ['kefalotyri-parmesan', 10],
      ['table-salt', 1.5],
    ],
    pastitsio: [
      ['pasta-cooked', 130],
      ['ground-beef', 90],
      ['tomato-sauce', 60],
      ['bechamel-sauce', 80],
      ['kefalotyri-parmesan', 15],
      ['olive-oil', 10],
      ['cinnamon', 1],
      ['table-salt', 1.5],
    ],
    gemista: [
      ['tomato', 110],
      ['bell-pepper', 90],
      ['white-rice-cooked', 110],
      ['potatoes', 60],
      ['onion', 30],
      ['olive-oil', 18],
      ['fresh-parsley', 6],
      ['fresh-mint', 4],
      ['table-salt', 1.2],
    ],
    'gyros-pita-pork': [
      ['pork-gyros', 110],
      ['pita-bread', 80],
      ['tzatziki', 45],
      ['tomato', 45],
      ['red-onion', 20],
      ['french-fries', 55],
      ['table-salt', 0.8],
    ],
    'gyros-pita-chicken': [
      ['chicken-thigh', 110],
      ['pita-bread', 80],
      ['mustard-sauce', 35],
      ['tomato', 45],
      ['lettuce', 25],
      ['french-fries', 55],
      ['table-salt', 0.8],
    ],
    horiatiki: [
      ['tomato', 130],
      ['cucumber', 80],
      ['bell-pepper', 40],
      ['red-onion', 30],
      ['feta-cheese', 60],
      ['kalamata-olives', 25],
      ['olive-oil', 20],
      ['dried-oregano', 2],
      ['table-salt', 0.6],
    ],
    'greek-salad': [
      ['tomato', 120],
      ['cucumber', 75],
      ['red-onion', 25],
      ['feta-cheese', 50],
      ['kalamata-olives', 20],
      ['olive-oil', 18],
      ['dried-oregano', 2],
      ['table-salt', 0.5],
    ],
    dakos: [
      ['barley-rusk', 55],
      ['tomato', 100],
      ['feta-cheese', 55],
      ['olive-oil', 18],
      ['capers', 8],
      ['dried-oregano', 2],
    ],
    spanakopita: [
      ['spinach', 90],
      ['feta-cheese', 45],
      ['phyllo-pastry', 55],
      ['olive-oil', 14],
      ['fresh-dill', 6],
      ['scallions', 20],
      ['whole-egg', 25],
      ['table-salt', 0.6],
    ],
    tiropita: [
      ['feta-cheese', 55],
      ['ricotta-anthotyro', 30],
      ['phyllo-pastry', 60],
      ['whole-egg', 25],
      ['olive-oil', 14],
    ],
    hortopita: [
      ['horta-greens', 100],
      ['phyllo-pastry', 55],
      ['olive-oil', 15],
      ['fresh-dill', 5],
      ['fresh-mint', 4],
      ['scallions', 20],
      ['table-salt', 0.7],
    ],
    kolokithopita: [
      ['zucchini', 100],
      ['feta-cheese', 45],
      ['phyllo-pastry', 55],
      ['whole-egg', 25],
      ['olive-oil', 14],
      ['fresh-mint', 4],
      ['table-salt', 0.6],
    ],
    fasolada: [
      ['white-beans', 160],
      ['carrots', 45],
      ['celery', 35],
      ['tomato-sauce', 65],
      ['onion', 30],
      ['olive-oil', 16],
      ['table-salt', 1.2],
    ],
    'fakes-soupa': [
      ['lentils-cooked', 180],
      ['carrots', 40],
      ['onion', 30],
      ['garlic', 6],
      ['tomato-paste', 12],
      ['olive-oil', 15],
      ['red-wine-vinegar', 8],
      ['table-salt', 1.2],
    ],
    revithada: [
      ['chickpeas-cooked', 170],
      ['onion', 40],
      ['lemon-juice', 20],
      ['olive-oil', 18],
      ['table-salt', 1.1],
    ],
    psarosoupa: [
      ['white-fish', 120],
      ['potatoes', 80],
      ['carrots', 50],
      ['celery', 35],
      ['lemon-juice', 20],
      ['olive-oil', 12],
      ['chicken-broth', 180],
      ['table-salt', 1.1],
    ],
    youvarlakia: [
      ['ground-beef', 100],
      ['white-rice-cooked', 55],
      ['whole-egg', 40],
      ['lemon-juice', 20],
      ['fresh-dill', 5],
      ['chicken-broth', 180],
      ['olive-oil', 8],
      ['table-salt', 1.2],
    ],
    lahanodolmades: [
      ['cabbage', 110],
      ['ground-beef', 90],
      ['white-rice-cooked', 60],
      ['whole-egg', 35],
      ['lemon-juice', 20],
      ['fresh-dill', 5],
      ['olive-oil', 10],
      ['table-salt', 1.2],
    ],
    strapatsada: [
      ['whole-egg', 100],
      ['tomato', 110],
      ['feta-cheese', 40],
      ['olive-oil', 12],
      ['dried-oregano', 1],
      ['table-salt', 0.5],
    ],
    'makaronia-me-kima': [
      ['pasta-cooked', 150],
      ['ground-beef', 95],
      ['tomato-sauce', 85],
      ['onion', 25],
      ['kefalotyri-parmesan', 18],
      ['olive-oil', 10],
      ['cinnamon', 1],
      ['table-salt', 1.2],
    ],
    'arakas-laderos': [
      ['green-peas', 140],
      ['potatoes', 70],
      ['carrots', 45],
      ['tomato-sauce', 55],
      ['fresh-dill', 6],
      ['olive-oil', 16],
      ['table-salt', 1.0],
    ],
    'anginares-polita': [
      ['artichokes', 120],
      ['green-peas', 70],
      ['carrots', 45],
      ['potatoes', 60],
      ['fresh-dill', 6],
      ['lemon-juice', 20],
      ['olive-oil', 16],
      ['table-salt', 1.0],
    ],
    spanakorizo: [
      ['spinach', 110],
      ['white-rice-cooked', 115],
      ['scallions', 25],
      ['fresh-dill', 6],
      ['lemon-juice', 18],
      ['olive-oil', 16],
      ['table-salt', 1.0],
    ],
    lahanorizo: [
      ['cabbage', 120],
      ['white-rice-cooked', 110],
      ['tomato-sauce', 55],
      ['lemon-juice', 15],
      ['olive-oil', 15],
      ['table-salt', 1.0],
    ],
    prassorizo: [
      ['leeks', 120],
      ['white-rice-cooked', 115],
      ['fresh-dill', 5],
      ['lemon-juice', 18],
      ['olive-oil', 15],
      ['table-salt', 1.0],
    ],
    tzatziki: [
      ['greek-yogurt-full', 85],
      ['cucumber', 35],
      ['garlic', 4],
      ['olive-oil', 10],
      ['fresh-dill', 3],
      ['red-wine-vinegar', 5],
      ['table-salt', 0.5],
    ],
    maroulosalata: [
      ['lettuce', 100],
      ['scallions', 25],
      ['fresh-dill', 8],
      ['olive-oil', 15],
      ['lemon-juice', 15],
      ['table-salt', 0.5],
    ],
    'lahano-karoto': [
      ['cabbage', 110],
      ['carrots', 55],
      ['olive-oil', 15],
      ['lemon-juice', 15],
      ['table-salt', 0.5],
    ],
    briam: [
      ['zucchini', 90],
      ['potatoes', 85],
      ['eggplant', 80],
      ['tomato', 80],
      ['onion', 30],
      ['olive-oil', 18],
      ['fresh-parsley', 6],
      ['table-salt', 1.0],
    ],
    fasolakia: [
      ['green-beans', 140],
      ['potatoes', 70],
      ['tomato-sauce', 60],
      ['onion', 25],
      ['fresh-dill', 5],
      ['olive-oil', 16],
      ['table-salt', 1.0],
    ],
    'garides-saganaki': [
      ['shrimp', 120],
      ['tomato-sauce', 85],
      ['feta-cheese', 45],
      ['olive-oil', 12],
      ['garlic', 5],
      ['fresh-parsley', 5],
      ['table-salt', 0.6],
    ],
    'soupies-spanaki': [
      ['squid-calamari', 120],
      ['spinach', 110],
      ['tomato-sauce', 50],
      ['fresh-dill', 6],
      ['olive-oil', 15],
      ['table-salt', 0.9],
    ],
    'giaourti-meli-karidia': [
      ['greek-yogurt-2', 170],
      ['honey', 20],
      ['walnuts', 20],
    ],
    'avocado-toast': [
      ['village-bread', 60],
      ['avocado', 75],
      ['olive-oil', 5],
      ['lemon-juice', 8],
      ['table-salt', 0.4],
    ],
    'salmon-rice-bowl': [
      ['salmon', 125],
      ['white-rice-cooked', 140],
      ['avocado', 55],
      ['cucumber', 55],
      ['soy-sauce', 10],
    ],
    'chicken-caesar-salad': [
      ['chicken-breast', 115],
      ['lettuce', 100],
      ['kefalotyri-parmesan', 18],
      ['mayo-dressing', 25],
      ['village-bread', 25],
    ],
    'cobb-salad': [
      ['chicken-breast', 100],
      ['lettuce', 90],
      ['avocado', 50],
      ['whole-egg', 50],
      ['bacon', 18],
      ['tomato', 55],
      ['olive-oil', 12],
    ],
    'burrito-bowl': [
      ['chicken-breast', 110],
      ['brown-rice-cooked', 120],
      ['black-beans', 85],
      ['tomato', 55],
      ['avocado', 50],
      ['sweet-corn', 45],
      ['table-salt', 0.8],
    ],
    cheeseburger: [
      ['ground-beef', 120],
      ['kasseri-cheese', 28],
      ['burger-bun', 60],
      ['lettuce', 20],
      ['tomato', 30],
      ['red-onion', 15],
      ['table-salt', 0.8],
    ],
    'veggie-omelette': [
      ['whole-egg', 120],
      ['kasseri-cheese', 25],
      ['spinach', 40],
      ['bell-pepper', 35],
      ['olive-oil', 8],
      ['table-salt', 0.5],
    ],
    'breakfast-burrito': [
      ['whole-egg', 100],
      ['kasseri-cheese', 25],
      ['avocado', 45],
      ['tomato', 40],
      ['pita-bread', 65],
      ['table-salt', 0.6],
    ],
    'oatmeal-berries': [
      ['rolled-oats', 45],
      ['whole-milk', 120],
      ['berries', 75],
      ['honey', 12],
      ['cinnamon', 1],
    ],
    'yogurt-berry-parfait': [
      ['greek-yogurt-2', 170],
      ['berries', 75],
      ['granola', 35],
      ['honey', 12],
    ],
    'ramen-bowl': [
      ['pasta-cooked', 150],
      ['pork-tenderloin', 85],
      ['whole-egg', 50],
      ['scallions', 15],
      ['chicken-broth', 260],
      ['soy-sauce', 12],
    ],
    'pho-beef': [
      ['beef-stew', 95],
      ['pasta-cooked', 140],
      ['beef-broth', 280],
      ['fresh-cilantro', 6],
      ['onion', 25],
      ['lemon-juice', 12],
      ['table-salt', 0.8],
    ],
    'spaghetti-bolognese': [
      ['pasta-cooked', 160],
      ['ground-beef', 95],
      ['tomato-sauce', 95],
      ['kefalotyri-parmesan', 15],
      ['garlic', 5],
      ['olive-oil', 8],
      ['table-salt', 1.1],
    ],
    'chicken-alfredo': [
      ['pasta-cooked', 150],
      ['chicken-breast', 105],
      ['heavy-cream', 55],
      ['kefalotyri-parmesan', 20],
      ['butter', 10],
      ['garlic', 4],
      ['table-salt', 1.0],
    ],
    'spaghetti-carbonara': [
      ['pasta-cooked', 180],
      ['guanciale-pancetta', 45],
      ['egg-yolk', 34],
      ['pecorino-romano', 35],
      ['black-pepper', 2],
      ['table-salt', 0.4],
    ],
    'cacio-e-pepe': [
      ['pasta-cooked', 190],
      ['pecorino-romano', 50],
      ['black-pepper', 3],
      ['olive-oil', 3],
      ['table-salt', 0.4],
    ],
    'pasta-alla-gricia': [
      ['pasta-cooked', 180],
      ['guanciale-pancetta', 50],
      ['pecorino-romano', 35],
      ['black-pepper', 2],
      ['table-salt', 0.3],
    ],
    'bucatini-amatriciana': [
      ['pasta-cooked', 180],
      ['guanciale-pancetta', 40],
      ['tomato-sauce', 95],
      ['pecorino-romano', 25],
      ['chili-flakes', 1],
      ['olive-oil', 5],
      ['table-salt', 0.5],
    ],
    'penne-arrabbiata': [
      ['pasta-cooked', 190],
      ['tomato-sauce', 110],
      ['olive-oil', 12],
      ['garlic', 6],
      ['chili-flakes', 2],
      ['fresh-parsley', 5],
      ['table-salt', 0.8],
    ],
    'spaghetti-aglio-olio': [
      ['pasta-cooked', 200],
      ['olive-oil', 20],
      ['garlic', 8],
      ['chili-flakes', 1],
      ['fresh-parsley', 6],
      ['table-salt', 0.9],
    ],
    'spaghetti-pomodoro': [
      ['pasta-cooked', 185],
      ['tomato-sauce', 115],
      ['olive-oil', 10],
      ['kefalotyri-parmesan', 15],
      ['garlic', 5],
      ['fresh-basil', 6],
      ['table-salt', 0.8],
    ],
    'spaghetti-puttanesca': [
      ['pasta-cooked', 185],
      ['tomato-sauce', 105],
      ['kalamata-olives', 25],
      ['capers', 10],
      ['anchovies', 15],
      ['olive-oil', 10],
      ['garlic', 5],
      ['chili-flakes', 1],
    ],
    'trofie-al-pesto': [
      ['pasta-cooked', 185],
      ['pesto', 45],
      ['kefalotyri-parmesan', 18],
      ['pine-nuts', 10],
      ['olive-oil', 4],
      ['table-salt', 0.4],
    ],
    'tagliatelle-bolognese': [
      ['pasta-cooked', 170],
      ['ground-beef', 90],
      ['tomato-sauce', 85],
      ['onion', 20],
      ['carrots', 20],
      ['celery', 15],
      ['kefalotyri-parmesan', 18],
      ['olive-oil', 8],
      ['table-salt', 0.8],
    ],
    'lasagna-bolognese': [
      ['pasta-cooked', 115],
      ['ground-beef', 85],
      ['tomato-sauce', 65],
      ['bechamel-sauce', 70],
      ['mozzarella', 35],
      ['kefalotyri-parmesan', 18],
      ['olive-oil', 6],
      ['table-salt', 0.7],
    ],
    'penne-alla-vodka': [
      ['pasta-cooked', 180],
      ['tomato-sauce', 90],
      ['heavy-cream', 45],
      ['kefalotyri-parmesan', 18],
      ['onion', 20],
      ['garlic', 4],
      ['olive-oil', 6],
      ['fresh-basil', 4],
      ['table-salt', 0.8],
    ],
    'penne-quattro-formaggi': [
      ['pasta-cooked', 175],
      ['gorgonzola', 30],
      ['mozzarella', 30],
      ['kasseri-cheese', 25],
      ['kefalotyri-parmesan', 20],
      ['heavy-cream', 35],
      ['black-pepper', 1],
    ],
    'fettuccine-alfredo-classic': [
      ['pasta-cooked', 185],
      ['butter', 28],
      ['kefalotyri-parmesan', 38],
      ['black-pepper', 2],
      ['table-salt', 0.5],
    ],
    'pasta-alla-norma': [
      ['pasta-cooked', 180],
      ['eggplant', 100],
      ['tomato-sauce', 105],
      ['ricotta-anthotyro', 35],
      ['olive-oil', 10],
      ['garlic', 5],
      ['fresh-basil', 6],
      ['table-salt', 0.8],
    ],
    'spaghetti-vongole': [
      ['pasta-cooked', 185],
      ['clams', 90],
      ['olive-oil', 14],
      ['white-wine', 30],
      ['garlic', 6],
      ['fresh-parsley', 6],
      ['chili-flakes', 1],
      ['table-salt', 0.6],
    ],
    'linguine-frutti-di-mare': [
      ['pasta-cooked', 180],
      ['shrimp', 65],
      ['mussels', 60],
      ['squid-calamari', 45],
      ['tomato', 55],
      ['olive-oil', 10],
      ['white-wine', 25],
      ['garlic', 6],
      ['fresh-parsley', 6],
      ['table-salt', 0.7],
    ],
    'linguine-scampi': [
      ['pasta-cooked', 180],
      ['shrimp', 110],
      ['butter', 12],
      ['olive-oil', 8],
      ['lemon-juice', 20],
      ['garlic', 8],
      ['fresh-parsley', 6],
      ['table-salt', 0.9],
    ],
    'spaghetti-tonno': [
      ['pasta-cooked', 185],
      ['tuna-water', 95],
      ['tomato-sauce', 95],
      ['kalamata-olives', 20],
      ['capers', 8],
      ['olive-oil', 8],
      ['garlic', 5],
      ['fresh-parsley', 5],
    ],
    'gnocchi-sorrentina': [
      ['potato-gnocchi', 190],
      ['tomato-sauce', 105],
      ['mozzarella', 45],
      ['kefalotyri-parmesan', 12],
      ['olive-oil', 8],
      ['fresh-basil', 6],
      ['table-salt', 0.5],
    ],
    'gnocchi-pesto': [
      ['potato-gnocchi', 185],
      ['pesto', 45],
      ['kefalotyri-parmesan', 18],
      ['pine-nuts', 8],
      ['olive-oil', 3],
    ],
    'gnocchi-gorgonzola': [
      ['potato-gnocchi', 185],
      ['gorgonzola', 40],
      ['heavy-cream', 35],
      ['walnuts', 15],
      ['kefalotyri-parmesan', 10],
    ],
    'ravioli-ricotta-spinach': [
      ['pasta-cooked', 150],
      ['ricotta-anthotyro', 65],
      ['spinach', 60],
      ['butter', 18],
      ['kefalotyri-parmesan', 20],
      ['table-salt', 0.5],
    ],
    'tortellini-panna-prosciutto': [
      ['pasta-cooked', 165],
      ['deli-ham', 55],
      ['heavy-cream', 60],
      ['kefalotyri-parmesan', 20],
      ['green-peas', 40],
      ['black-pepper', 1],
      ['table-salt', 0.4],
    ],
    'tagliatelle-funghi-tartufo': [
      ['pasta-cooked', 180],
      ['mushrooms', 90],
      ['heavy-cream', 50],
      ['kefalotyri-parmesan', 22],
      ['truffle-oil', 6],
      ['garlic', 5],
      ['fresh-parsley', 5],
      ['table-salt', 0.8],
    ],
    'pasta-primavera': [
      ['pasta-cooked', 175],
      ['zucchini', 60],
      ['bell-pepper', 50],
      ['broccoli', 50],
      ['tomato', 55],
      ['green-peas', 35],
      ['olive-oil', 10],
      ['kefalotyri-parmesan', 15],
      ['garlic', 4],
      ['table-salt', 0.8],
    ],
    'rigatoni-salsiccia': [
      ['pasta-cooked', 180],
      ['italian-sausage', 85],
      ['tomato-sauce', 95],
      ['onion', 25],
      ['garlic', 5],
      ['kefalotyri-parmesan', 15],
      ['olive-oil', 6],
      ['fresh-basil', 5],
      ['table-salt', 0.4],
    ],
    'pasta-e-fagioli': [
      ['pasta-cooked', 105],
      ['white-beans', 120],
      ['tomato-sauce', 85],
      ['carrots', 30],
      ['celery', 25],
      ['onion', 25],
      ['olive-oil', 10],
      ['kefalotyri-parmesan', 12],
      ['garlic', 4],
      ['table-salt', 1.0],
    ],
    'greek-tost': [
      ['village-bread', 60],
      ['kasseri-cheese', 35],
      ['deli-ham', 35],
      ['butter', 5],
    ],
    baklava: [
      ['phyllo-pastry', 45],
      ['walnuts', 25],
      ['butter', 12],
      ['honey', 25],
      ['white-sugar', 12],
      ['cinnamon', 1],
    ],
    loukoumades: [
      ['phyllo-pastry', 75],
      ['olive-oil', 10],
      ['honey', 30],
      ['walnuts', 12],
      ['cinnamon', 1],
    ],
    rizogalo: [
      ['white-rice-cooked', 85],
      ['whole-milk', 140],
      ['white-sugar', 18],
      ['cinnamon', 1],
    ],
    'freddo-cappuccino': [
      ['espresso-coffee', 60],
      ['whole-milk', 80],
      ['white-sugar', 6],
    ],
    'cappuccino-latte': [
      ['espresso-coffee', 60],
      ['whole-milk', 140],
    ],
  };

  // Direct mapping for common single-ingredient USDA foods to INGREDIENTS_DB
  const SINGLE_FOOD_TO_ING = {
    banana: 'banana',
    apple: 'apple',
    orange: 'orange',
    strawberries: 'berries',
    blueberries: 'berries',
    avocado: 'avocado',
    lemon: 'lemon-juice',
    'spinach-raw': 'spinach',
    broccoli: 'broccoli',
    'sweet-potato': 'sweet-potato',
    'russet-potato': 'potatoes',
    carrots: 'carrots',
    'red-bell-pepper': 'bell-pepper',
    tomato: 'tomato',
    cucumber: 'cucumber',
    zucchini: 'zucchini',
    'green-beans': 'green-beans',
    mushrooms: 'mushrooms',
    'red-onion': 'red-onion',
    garlic: 'garlic',
    'romaine-lettuce': 'lettuce',
    'green-peas': 'green-peas',
    'sweet-corn': 'sweet-corn',
    celery: 'celery',
    eggplant: 'eggplant',
    'chicken-breast': 'chicken-breast',
    'chicken-thigh': 'chicken-thigh',
    'turkey-breast': 'turkey-breast',
    'whole-egg': 'whole-egg',
    'hard-boiled-egg': 'whole-egg',
    'egg-whites': 'egg-white',
    'ground-beef-93': 'ground-beef',
    'sirloin-steak': 'beef-stew',
    'pork-tenderloin': 'pork-tenderloin',
    bacon: 'bacon',
    'lamb-chop': 'lamb-meat',
    'deli-turkey': 'deli-ham',
    'atlantic-salmon': 'salmon',
    'canned-tuna': 'tuna-water',
    sardines: 'sardines',
    shrimp: 'shrimp',
    'cod-fillet': 'white-fish',
    mussels: 'mussels',
    'greek-yogurt-0': 'greek-yogurt-2',
    'greek-yogurt-whole': 'greek-yogurt-full',
    'whole-milk': 'whole-milk',
    'skim-milk': 'skim-milk',
    'cheddar-cheese': 'kasseri-cheese',
    mozzarella: 'mozzarella',
    parmesan: 'kefalotyri-parmesan',
    'feta-cheese': 'feta-cheese',
    butter: 'butter',
    'ricotta-part-skim': 'ricotta-anthotyro',
    'olive-oil': 'olive-oil',
    walnuts: 'walnuts',
    almonds: 'almonds',
    'peanut-butter': 'peanut-butter',
    'white-rice': 'white-rice-cooked',
    'brown-rice': 'brown-rice-cooked',
    quinoa: 'quinoa-cooked',
    oats: 'rolled-oats',
    'black-beans': 'black-beans',
    chickpeas: 'chickpeas-cooked',
    lentils: 'lentils-cooked',
    'dark-chocolate': 'dark-chocolate',
  };

  // Keyword rules to decompose any of the 2,154 composite dishes into real INGREDIENTS_DB items
  // [regex, ingredientId, baseWeightGrams]
  const KEYWORD_RULES = [
    [/\bchicken\b|\bkotopoulo\b|\bkotosoupa\b|\bkotopita\b|\brooster\b|\bkokoras\b/i, 'chicken-breast', 100],
    [/\bturkey\b|\bgalopoula\b/i, 'turkey-breast', 100],
    [/\blamb\b|\barnaki\b|\bgoat\b|\bkleftiko\b|\bpaidak/i, 'lamb-meat', 110],
    [/\bground beef\b|\bminced\b|\bkima\b|\bbifteki\b|\bburger\b|\bkefted|\byouvarlak|\bgiouvarlak|\bpastitsio\b|\bmoussaka\b|\bmousakas\b|\bbolognese\b|\blasagna\b/i, 'ground-beef', 95],
    [/\bbeef\b|\bveal\b|\bmoschari\b|\bsteak\b|\bstifado\b|\bkokkinisto\b|\bsofrito\b|\bpastitsada\b|\bpho\b/i, 'beef-stew', 105],
    [/\bgyros\b.*pork|\bpork\b.*gyros|\bgyros\b(?!.*chicken)/i, 'pork-gyros', 110],
    [/\bpork\b|\bhirin|\bbekri\b|\bsouvlaki\b|\bkalamaki\b/i, 'pork-tenderloin', 105],
    [/\bbacon\b|\bcarbonara\b|\bblt\b|\bclub\b/i, 'bacon', 25],
    [/\bham\b|\bzampon\b|\bprosciutto\b|\bdeli\b/i, 'deli-ham', 40],
    [/\bsausage\b|\bloukaniko\b|\bspetsofai\b/i, 'greek-sausage', 85],
    [/\bsalmon\b/i, 'salmon', 115],
    [/\btuna\b/i, 'tuna-water', 85],
    [/\bsardine|\banchov|\bgavros\b|\bsardel/i, 'sardines', 95],
    [/\bshrimp\b|\bprawn\b|\bgarides\b|\bgaridomakaronada\b|\blobster\b|\bastak/i, 'shrimp', 105],
    [/\bsquid\b|\bcalamari\b|\bkalamar|\bsoupies\b|\bcuttlefish\b/i, 'squid-calamari', 110],
    [/\boctopus\b|\bchtapod|\bhtapod/i, 'octopus', 110],
    [/\bmussel|\bmidia\b|\bmidomakaronada\b/i, 'mussels', 90],
    [/\bfish\b|\bcod\b|\bbakalao|\bsea bream\b|\btsipoura\b|\blavraki\b|\bpsarosoupa\b|\bswordfish\b|\bmullet\b|\bbarboun/i, 'white-fish', 120],
    [/\begg\b|\beggs\b|\bomelette\b|\bfrittata\b|\bavgolemono\b|\bstrapatsada\b|\bkagianas\b|\bbenedict\b|\bshakshuka\b/i, 'whole-egg', 55],
    [/\bfeta\b|\bhoriatiki\b|\bspanakopita\b|\btiropita\b|\btyropita\b|\btyrokafteri\b|\bhtipiti\b|\bdakos\b/i, 'feta-cheese', 45],
    [/\bhalloumi\b/i, 'halloumi', 55],
    [/\bparmesan\b|\bkefalotyri\b|\bmizithra\b|\banthotyro\b|\bricotta\b/i, 'ricotta-anthotyro', 40],
    [/\bmozzarella\b|\bpizza\b|\bcaprese\b/i, 'mozzarella', 45],
    [/\bcheese\b|\bkasseri\b|\bkaseri\b|\bgraviera\b|\bcheddar\b|\bsaganaki\b|\btost\b|\bquesadilla\b|\bmacaroni\b|\bfour cheeses\b/i, 'kasseri-cheese', 35],
    [/\btzatziki\b/i, 'tzatziki', 45],
    [/\byogurt\b|\bgiaourti\b/i, 'greek-yogurt-2', 110],
    [/\bbechamel\b|\bmoussaka\b|\bpastitsio\b|\bpapoutsakia\b/i, 'bechamel-sauce', 70],
    [/\bcream\b|\balfredo\b|\bcarbonara\b/i, 'heavy-cream', 45],
    [/\bbutter\b|\bcroissant\b|\bbrioche\b|\bpeinirli\b|\bbaklava\b|\bkourabied/i, 'butter', 12],
    [/\bmilk\b|\blatte\b|\bcappuccino\b|\brizogalo\b|\bice cream\b|\bgalaktoboureko\b|\bmilkshake\b/i, 'whole-milk', 110],
    [/\borzo\b|\bkrithar|\byouvetsi\b|\bgiouvetsi\b/i, 'orzo-cooked', 115],
    [/\bpasta\b|\bspaghetti\b|\bfettuccine\b|\bpenne\b|\btortellini\b|\bravioli\b|\bhilopites\b|\bskioufichta\b|\bgogkes\b|\bbucatini\b|\blasagna\b|\bnoodle\b|\bramen\b|\bmacaroni\b/i, 'pasta-cooked', 135],
    [/\bbrown rice\b/i, 'brown-rice-cooked', 110],
    [/\brice\b|\brisotto\b|\bgemista\b|\bspanakorizo\b|\blahanorizo\b|\bprassorizo\b|\bdomatorizo\b|\brizogalo\b|\bavgolemono\b|\bdolmad|\bsushi\b|\bpilaf\b/i, 'white-rice-cooked', 95],
    [/\bfrench fries\b|\bfries\b/i, 'french-fries', 70],
    [/\bsweet potato/i, 'sweet-potato', 100],
    [/\bpotato\b|\bpotatoes\b|\bpatates\b|\bmoussaka\b|\bbriam\b|\bskordalia\b|\btourlou\b/i, 'potatoes', 85],
    [/\bpita\b(?!.*pie)|\bgyros\b|\bskepasti\b|\bwrap\b|\bfalafel\b|\bsouvlaki\b/i, 'pita-bread', 75],
    [/\bphyllo\b|\bfilo\b|\bspanakopita\b|\btiropita\b|\btyropita\b|\bhortopita\b|\bbougatsa\b|\bbaklava\b|\bkataifi\b|\bgalaktoboureko\b|\bportokalopita\b|\bpie\b|\bpita\b/i, 'phyllo-pastry', 55],
    [/\brusk\b|\bpaximad|\bdakos\b/i, 'barley-rusk', 50],
    [/\bburger\b|\bbun\b/i, 'burger-bun', 55],
    [/\bbread\b|\btoast\b|\btost\b|\bsandwich\b|\bclub\b|\bcrouton\b|\bbruschetta\b|\bkoulouri\b/i, 'village-bread', 55],
    [/\boat|\bporridge\b/i, 'rolled-oats', 45],
    [/\bquinoa\b/i, 'quinoa-cooked', 100],
    [/\bgranola\b|\bmuesli\b/i, 'granola', 35],
    [/\blentil\b|\bfakes\b/i, 'lentils-cooked', 140],
    [/\bchickpea\b|\brevith|\bhummus\b|\bfalafel\b/i, 'chickpeas-cooked', 130],
    [/\bfava\b|\bsplit pea/i, 'split-peas-fava', 130],
    [/\bblack bean/i, 'black-beans', 110],
    [/\bbean\b|\bfasolada\b|\bgigantes\b|\bblack-eyed\b|\bmavromatika\b/i, 'white-beans', 135],
    [/\bpea\b|\bpeas\b|\barakas\b|\baginares\b|\banginares\b/i, 'green-peas', 85],
    [/\bgreen bean|\bfasolakia\b/i, 'green-beans', 115],
    [/\bartichoke|\baginares\b|\banginares\b/i, 'artichokes', 95],
    [/\bokra\b|\bbamies\b/i, 'okra', 105],
    [/\beggplant\b|\bmelitzan|\bmoussaka\b|\bmousakas\b|\bpapoutsakia\b|\bimam\b|\bbriam\b|\btourlou\b/i, 'eggplant', 90],
    [/\bzucchini\b|\bkolokith|\bbriam\b|\btourlou\b/i, 'zucchini', 90],
    [/\btomato sauce\b|\bmarinara\b|\bnapolitana\b|\barrabiata\b|\barrabbiata\b|\bbolognese\b|\bkokkinisto\b|\bkima\b|\bspetsofai\b|\byahni\b|\bgigantes\b|\bfasolakia\b|\bbamies\b|\bpastitsada\b/i, 'tomato-sauce', 75],
    [/\btomato\b|\bdomat|\bhoriatiki\b|\bdakos\b|\bgemista\b|\bstrapatsada\b|\bpizza\b|\bgyros\b/i, 'tomato', 80],
    [/\bcucumber\b|\bhoriatiki\b|\btzatziki\b/i, 'cucumber', 60],
    [/\bspinach\b|\bspanak/i, 'spinach', 85],
    [/\bhorta\b|\bgreens\b|\bdandelion\b|\bstamnagathi\b/i, 'horta-greens', 100],
    [/\blettuce\b|\bmaroul|\bcaesar\b|\bcobb\b|\bfricassee\b|\bsalad\b/i, 'lettuce', 75],
    [/\bcabbage\b|\blahan|\bcoleslaw\b/i, 'cabbage', 90],
    [/\bcarrot\b|\bkaroto\b|\bfasolada\b|\bfakes\b|\bpsarosoupa\b|\barakas\b/i, 'carrots', 45],
    [/\bcelery\b|\bfasolada\b|\bpsarosoupa\b/i, 'celery', 35],
    [/\bleek\b|\bprasso/i, 'leeks', 80],
    [/\bbell pepper\b|\bpepper\b|\bpiperia\b|\bgemista\b|\bspetsofai\b|\bhoriatiki\b/i, 'bell-pepper', 55],
    [/\bmushroom\b|\bmanitar/i, 'mushrooms', 70],
    [/\bavocado\b|\bguacamole\b/i, 'avocado', 55],
    [/\bbroccoli\b/i, 'broccoli', 85],
    [/\bcorn\b/i, 'sweet-corn', 50],
    [/\bred onion\b/i, 'red-onion', 25],
    [/\bonion\b|\bshallot\b|\bstifado\b|\bimam\b/i, 'onion', 35],
    [/\bscallion\b|\bspring onion\b|\bgreen onion\b/i, 'scallions', 20],
    [/\bgarlic\b|\bskordalia\b|\baglio\b|\bsofrito\b/i, 'garlic', 6],
    [/\bdill\b|\bavgolemono\b|\bspanakorizo\b|\bmaroulosalata\b|\barakas\b|\btzatziki\b|\byouvarlak|\bgiouvarlak|\bfricassee\b/i, 'fresh-dill', 5],
    [/\bparsley\b|\bgemista\b|\bbriam\b|\bgarides\b|\bmelitzanosalata\b/i, 'fresh-parsley', 5],
    [/\bmint\b|\bkefted|\bkolokithokefted|\bdolmad/i, 'fresh-mint', 4],
    [/\bcilantro\b|\btaco\b|\bburrito\b|\bpho\b/i, 'fresh-cilantro', 5],
    [/\boregano\b|\bhoriatiki\b|\bdakos\b|\bsouvlaki\b|\bkalamaki\b|\bbifteki\b|\bpaidak/i, 'dried-oregano', 2],
    [/\bcinnamon\b|\bbougatsa\b|\brizogalo\b|\bloukoumades\b|\bbaklava\b|\bmelomakarona\b/i, 'cinnamon', 1],
    [/\bolive\b|\bhoriatiki\b|\beliopsomo\b/i, 'kalamata-olives', 22],
    [/\bcaper\b|\bdakos\b/i, 'capers', 8],
    [/\blemon\b|\bavgolemono\b|\blemonato\b|\bladolemono\b/i, 'lemon-juice', 20],
    [/\bpesto\b/i, 'pesto', 30],
    [/\bmayo\b|\bdressing\b/i, 'mayo-dressing', 20],
    [/\bmustard\b/i, 'mustard-sauce', 25],
    [/\bsoy sauce\b|\bteriyaki\b|\bsushi\b|\bstir-fry\b/i, 'soy-sauce', 12],
    [/\bwine\b|\bbekri\b|\bsofrito\b|\bstifado\b/i, 'white-wine', 25],
    [/\bsoup\b|\bsoupa\b|\bbroth\b|\bramen\b|\bpho\b|\btrahana/i, 'chicken-broth', 200],
    [/\bwalnut\b|\bkarid|\bbaklava\b|\bmelomakarona\b|\bkaridopita\b/i, 'walnuts', 20],
    [/\balmond\b|\bamygdal|\bkourabied/i, 'almonds', 20],
    [/\btahini\b|\bhalva\b|\bhummus\b/i, 'tahini', 22],
    [/\bhoney\b|\bmeli\b|\bloukoumades\b|\bbaklava\b|\bpasteli\b|\bmelomakarona\b/i, 'honey', 22],
    [/\bchocolate\b|\bpraline\b|\bnutella\b|\bcocoa\b|\bmocha\b|\bbrownie\b|\bsokolat/i, 'chocolate-praline', 28],
    [/\bcustard\b|\bbougatsa\b|\bgalaktoboureko\b|\bekmek\b|\bcrema\b|\bprofiterol|\bmille-feuille\b/i, 'custard-cream', 85],
    [/\bsyrup\b|\bsugar\b|\bcake\b|\bdonut\b|\bpastry\b|\bportokalopita\b|\bkataifi\b|\brevani\b|\bsweet\b|\bglyko\b|\bdessert\b/i, 'white-sugar', 20],
    [/\bespresso\b|\bcoffee\b|\bfreddo\b|\bfrappe\b|\bcappuccino\b|\blatte\b/i, 'espresso-coffee', 60],
    [/\bprotein\b|\bwhey\b/i, 'whey-protein', 30],
    [/\bbanana\b/i, 'banana', 90],
    [/\bapple\b|\bmilopita\b/i, 'apple', 100],
    [/\borange\b|\bportokal/i, 'orange', 90],
    [/\bberr(y|ies)\b|\bstrawberr|\bblueberr|\braspberr/i, 'berries', 70],
    [/\braisin\b|\bdate\b|\bfig\b/i, 'raisins-dates', 25],
  ];

  function createInlineIngredientFromFood(food) {
    const baseGrams = Math.max(10, Number(food.grams) || 100);
    const scale = 100 / baseGrams;
    const isLiquid = /\bml\b/i.test(food.serving || '');
    const sodiumMg = Number(food.nutrients?.sodium) || 0;
    const saltPerServing = Number(food.salt != null ? food.salt : (sodiumMg * 2.5) / 1000);
    const nutsPer100 = {};
    for (const [k, v] of Object.entries(food.nutrients || {})) {
      nutsPer100[k] = Number(((Number(v) || 0) * scale).toFixed(2));
    }
    return {
      id: `inline:${food.id}`,
      name: String(food.name || 'Base Food').replace(/\s*\([^)]*\)\s*/g, ' ').trim() || food.name,
      category: food.category || 'Custom',
      unit: isLiquid ? 'ml' : 'g',
      defaultAmount: Math.round(baseGrams),
      calories: Number(((Number(food.calories) || 0) * scale).toFixed(1)),
      protein: Number(((Number(food.protein) || 0) * scale).toFixed(2)),
      carbs: Number(((Number(food.carbs) || 0) * scale).toFixed(2)),
      fat: Number(((Number(food.fat) || 0) * scale).toFixed(2)),
      fiber: Number(((Number(food.fiber) || 0) * scale).toFixed(2)),
      sugar: Number(((Number(food.sugar) || 0) * scale).toFixed(2)),
      salt: Number((saltPerServing * scale).toFixed(2)),
      nutrients: nutsPer100,
    };
  }

  function resolveIngredient(item, customIngredients = []) {
    if (!item) return null;
    if (item.inlineIngredient) return item.inlineIngredient;
    if (INGREDIENTS_BY_ID[item.ingredientId]) return INGREDIENTS_BY_ID[item.ingredientId];
    return (customIngredients || []).find((c) => c.id === item.ingredientId) || null;
  }

  const ORIGINAL_RECIPE_CACHE = new WeakMap();

  function cloneItemsShallow(items) {
    return items.map((it) => ({
      ingredientId: it.ingredientId,
      amount: it.amount,
      ...(it.inlineIngredient ? { inlineIngredient: it.inlineIngredient } : {}),
    }));
  }

  /**
   * Generates the original structured ingredient list [{ ingredientId, amount, inlineIngredient? }]
   * for ANY food in the 2,154-food database (memoized per food object for instant rendering).
   */
  function getOriginalRecipeItems(food) {
    if (!food) return [];

    // 0. User-built custom recipe with explicit ingredients
    if (Array.isArray(food.recipeItems) && food.recipeItems.length > 0) {
      return food.recipeItems.map((it) => ({
        ingredientId: it.ingredientId,
        amount: Number(it.amount) || 0,
        ...(it.inlineIngredient ? { inlineIngredient: it.inlineIngredient } : {}),
      }));
    }

    const cached = ORIGINAL_RECIPE_CACHE.get(food);
    if (cached) return cloneItemsShallow(cached);

    let computed;

    // 1. Hand-crafted signature recipe
    if (CURATED_RECIPES[food.id]) {
      computed = CURATED_RECIPES[food.id].map(([ingredientId, amount]) => ({
        ingredientId,
        amount,
      }));
    } else if (SINGLE_FOOD_TO_ING[food.id] && INGREDIENTS_BY_ID[SINGLE_FOOD_TO_ING[food.id]]) {
      // 2. Single-ingredient whole food directly in INGREDIENTS_DB
      const ingId = SINGLE_FOOD_TO_ING[food.id];
      const grams = Math.max(5, Math.round(Number(food.grams) || INGREDIENTS_BY_ID[ingId].defaultAmount || 100));
      computed = [{ ingredientId: ingId, amount: grams }];
    } else {
      // 3. Auto-decompose composite dishes across all 2,154 foods using INGREDIENTS_DB
      const text = `${food.name || ''} ${food.description || ''}`;
      const matched = [];
      const seen = new Set();
      for (const [regex, ingId, baseQty] of KEYWORD_RULES) {
        if (regex.test(text) && !seen.has(ingId) && INGREDIENTS_BY_ID[ingId]) {
          seen.add(ingId);
          matched.push({ ingredientId: ingId, amount: baseQty });
          if (matched.length >= 6) break;
        }
      }

      const isSavoryDish = /Greek Meals|Meals|Pies|Salads|Soups|Seafood|Meat|Street Food|Appetizers|Meze|Pasta/i.test(
        `${food.category || ''} ${food.description || ''}`
      );
      const isSweetOrDrink = /Dessert|Sweet|Beverage|Drink|Coffee|Fruit|Bakery/i.test(
        `${food.category || ''} ${food.name || ''}`
      );

      if (matched.length >= 2) {
        if (isSavoryDish && !isSweetOrDrink && !seen.has('olive-oil')) {
          matched.push({ ingredientId: 'olive-oil', amount: 12 });
          seen.add('olive-oil');
        }
        if (isSavoryDish && !isSweetOrDrink && !seen.has('table-salt')) {
          matched.push({ ingredientId: 'table-salt', amount: 1.0 });
          seen.add('table-salt');
        }

        const rawTotals = computeRecipeTotals(matched, []);
        const targetKcal = Number(food.calories) || 0;
        if (targetKcal > 40 && rawTotals.calories > 40) {
          const factor = Math.max(0.45, Math.min(2.1, targetKcal / rawTotals.calories));
          computed = matched.map((it) => {
            const isTiny = it.ingredientId === 'table-salt' || it.amount <= 10;
            const scaled = isTiny
              ? Number(Math.max(0.5, it.amount * Math.min(1.4, factor)).toFixed(1))
              : Math.max(5, Math.round((it.amount * factor) / 5) * 5);
            return { ingredientId: it.ingredientId, amount: scaled };
          });
        } else {
          computed = matched;
        }
      } else {
        // 4. Fallback: exact per-100g inline base ingredient
        const inline = createInlineIngredientFromFood(food);
        computed = [
          {
            ingredientId: inline.id,
            amount: inline.defaultAmount,
            inlineIngredient: inline,
          },
        ];
      }
    }

    ORIGINAL_RECIPE_CACHE.set(food, computed);
    return cloneItemsShallow(computed);
  }

  /**
   * Computes exact nutrition strictly by summing ingredient-by-ingredient.
   */
  function computeRecipeTotals(items = [], customIngredients = []) {
    const totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      salt: 0,
      totalAmount: 0,
      nutrients: {
        vitA: 0,
        vitC: 0,
        vitD: 0,
        vitE: 0,
        vitK: 0,
        vitB12: 0,
        folate: 0,
        iron: 0,
        calcium: 0,
        magnesium: 0,
        potassium: 0,
        zinc: 0,
        omega3: 0,
        sodium: 0,
      },
      breakdown: [],
    };

    for (const item of items || []) {
      const ing = resolveIngredient(item, customIngredients);
      if (!ing) continue;
      const amt = Math.max(0, Number(item.amount) || 0);
      const contrib = computeIngredientNutrition(ing, amt);
      totals.calories += contrib.calories;
      totals.protein += contrib.protein;
      totals.carbs += contrib.carbs;
      totals.fat += contrib.fat;
      totals.fiber += contrib.fiber;
      totals.sugar += contrib.sugar;
      totals.salt += contrib.salt;
      totals.totalAmount += amt;

      for (const [k, v] of Object.entries(contrib.nutrients)) {
        totals.nutrients[k] = (totals.nutrients[k] || 0) + (Number(v) || 0);
      }

      totals.breakdown.push({
        ingredientId: item.ingredientId,
        ingredient: ing,
        amount: amt,
        unit: ing.unit || 'g',
        ...contrib,
      });
    }

    totals.calories = Math.round(totals.calories);
    totals.protein = Number(totals.protein.toFixed(1));
    totals.carbs = Number(totals.carbs.toFixed(1));
    totals.fat = Number(totals.fat.toFixed(1));
    totals.fiber = Number(totals.fiber.toFixed(1));
    totals.sugar = Number(totals.sugar.toFixed(1));
    totals.salt = Number(totals.salt.toFixed(2));
    totals.totalAmount = Math.round(totals.totalAmount);

    for (const k of Object.keys(totals.nutrients)) {
      totals.nutrients[k] = Number((totals.nutrients[k] || 0).toFixed(2));
    }

    return totals;
  }

  function summarizeRecipeChanges(originalItems = [], currentItems = [], customIngredients = []) {
    const origMap = new Map();
    for (const it of originalItems || []) {
      origMap.set(it.ingredientId, Number(it.amount) || 0);
    }
    const curMap = new Map();
    for (const it of currentItems || []) {
      curMap.set(it.ingredientId, (curMap.get(it.ingredientId) || 0) + (Number(it.amount) || 0));
    }

    const removed = [];
    const added = [];
    const changed = [];

    for (const it of originalItems || []) {
      const ing = resolveIngredient(it, customIngredients);
      const name = ing ? ing.name.replace(/\s*\([^)]*\)/g, '').trim() : it.ingredientId;
      if (!curMap.has(it.ingredientId) || curMap.get(it.ingredientId) === 0) {
        removed.push(name);
      } else {
        const curAmt = curMap.get(it.ingredientId);
        if (Math.abs(curAmt - (Number(it.amount) || 0)) >= 0.4) {
          changed.push(`${name} ${curAmt}${ing?.unit || 'g'}`);
        }
      }
    }

    for (const it of currentItems || []) {
      if (!origMap.has(it.ingredientId)) {
        const ing = resolveIngredient(it, customIngredients);
        const name = ing ? ing.name.replace(/\s*\([^)]*\)/g, '').trim() : it.ingredientId;
        added.push(`${name} ${it.amount}${ing?.unit || 'g'}`);
      }
    }

    const parts = [];
    if (removed.length > 0) parts.push(`No ${removed.slice(0, 3).join(', ')}`);
    if (added.length > 0) parts.push(`+ ${added.slice(0, 3).join(', ')}`);
    if (parts.length === 0 && changed.length > 0) parts.push(changed.slice(0, 2).join(' · '));
    return parts.join(' · ');
  }

  function buildMacroLine(totals, mult = 1) {
    const p = ((Number(totals.protein) || 0) * mult).toFixed(1);
    const c = ((Number(totals.carbs) || 0) * mult).toFixed(1);
    const sug = ((Number(totals.sugar) || 0) * mult).toFixed(1);
    const f = ((Number(totals.fat) || 0) * mult).toFixed(1);
    const saltVal =
      totals.salt != null
        ? Number(totals.salt)
        : ((Number(totals.nutrients?.sodium) || 0) * 2.5) / 1000;
    const salt = (saltVal * mult).toFixed(2);
    return `Protein ${p} g · Carbs ${c} g · Sugars ${sug} g · Fat ${f} g · Salt ${salt} g`;
  }

  function buildRecipeDescription(baseFood, items, totals, customIngredients = []) {
    const baseDesc = (baseFood?.description || `${baseFood?.name || 'Recipe'}.`)
      .replace(/\s*Ingredients:.*$/i, '')
      .trim();
    const ingNames = (totals.breakdown || []).map((b) => {
      const shortName = b.ingredient.name.replace(/\s*\([^)]*\)/g, '').trim();
      return `${shortName} (${b.amount} ${b.unit})`;
    });
    const ingText = ingNames.length > 0 ? ` Ingredients: ${ingNames.join(', ')}.` : '';
    const macroText = ` Macros: ${buildMacroLine(totals, 1)}.`;
    return `${baseDesc}${ingText}${macroText}`;
  }

  function buildFoodFromRecipeItems(baseFood, items, customIngredients = [], originalItems = null) {
    const totals = computeRecipeTotals(items, customIngredients);
    const orig = originalItems || getOriginalRecipeItems(baseFood);
    const changeSummary = summarizeRecipeChanges(orig, items, customIngredients);
    const ingCount = (items || []).length;
    const servingStr =
      totals.totalAmount > 0
        ? `${totals.totalAmount} g${ingCount > 1 ? ` · ${ingCount} ingredients` : ''}`
        : baseFood.serving || '1 serving';

    return {
      ...baseFood,
      serving: servingStr,
      grams: totals.totalAmount || baseFood.grams || 100,
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      fiber: totals.fiber,
      sugar: totals.sugar,
      salt: totals.salt,
      nutrients: totals.nutrients,
      description: buildRecipeDescription(baseFood, items, totals, customIngredients),
      recipeItems: (items || []).map((it) => ({
        ingredientId: it.ingredientId,
        amount: Number(it.amount) || 0,
        ...(it.inlineIngredient ? { inlineIngredient: it.inlineIngredient } : {}),
      })),
      recipeSummary: changeSummary || '',
      breakdown: totals.breakdown,
    };
  }

  /**
   * Returns a single-ingredient pseudo-food so any ingredient from the Ingredients DB
   * can be opened in the Recipe Editor modal, scaled in grams, combined with other
   * ingredients, and logged cleanly.
   */
  function ingredientToFood(ing) {
    if (!ing) return null;
    const amt = Number(ing.defaultAmount) || 100;
    const baseFood = {
      id: `ing:${ing.id}`,
      name: ing.name,
      category: `Ingredient · ${ing.category}`,
      serving: `${amt} ${ing.unit || 'g'}`,
      grams: amt,
      description: `${ing.name} — raw/cooking ingredient (${ing.calories} kcal per 100 ${ing.unit || 'g'}).`,
      isIngredientItem: true,
    };
    const items = [{ ingredientId: ing.id, amount: amt }];
    return buildFoodFromRecipeItems(baseFood, items, [ing], items);
  }

  function getFoodSaltGrams(food) {
    if (!food) return 0;
    if (food.salt != null && !Number.isNaN(Number(food.salt))) return Number(food.salt);
    const sodiumMg = Number(food.nutrients?.sodium) || 0;
    return Number(((sodiumMg * 2.5) / 1000).toFixed(2));
  }

  /* ==================== GREEK & GREEKLISH BILINGUAL SEARCH ==================== */
  const GREEK_DIGRAPHS = [
    ['ου', 'ou'],
    ['αι', 'ai'],
    ['ει', 'ei'],
    ['οι', 'oi'],
    ['αυ', 'av'],
    ['ευ', 'ev'],
    ['μπ', 'b'],
    ['ντ', 'd'],
    ['γκ', 'g'],
    ['γγ', 'g'],
    ['τζ', 'tz'],
    ['τσ', 'ts'],
  ];

  const GREEK_CHAR_MAP = {
    α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th',
    ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
    ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'h', ψ: 'ps', ω: 'o',
  };

  // Phonetic Greek/Greeklish stems -> exact English food/ingredient phrases
  const GREEK_ALIASES = [
    ['kotopoul', ['chicken']],
    ['kotosoup', ['avgolemono', 'chicken soup']],
    ['moshar', ['beef', 'veal']],
    ['hirin', ['pork']],
    ['hoirin', ['pork']],
    ['arnak', ['lamb']],
    ['arni', ['lamb']],
    ['avg', ['egg']],
    ['rizi', ['rice']],
    ['rizogal', ['rizogalo', 'rice pudding']],
    ['patat', ['potato']],
    ['domat', ['tomato']],
    ['tomat', ['tomato']],
    ['agour', ['cucumber']],
    ['kremid', ['onion']],
    ['skord', ['garlic']],
    ['karot', ['carrot']],
    ['spanak', ['spinach']],
    ['maroul', ['lettuce']],
    ['lahan', ['cabbage']],
    ['melitzan', ['eggplant']],
    ['kolokith', ['zucchini']],
    ['piperi', ['pepper']],
    ['manitar', ['mushroom']],
    ['anith', ['dill']],
    ['maintan', ['parsley']],
    ['maidan', ['parsley']],
    ['diosm', ['mint']],
    ['rigan', ['oregano']],
    ['lemon', ['lemon']],
    ['elaiolad', ['olive oil']],
    ['ladi', ['olive oil']],
    ['voutir', ['butter']],
    ['alat', ['salt']],
    ['zahar', ['sugar']],
    ['meli', ['honey']],
    ['gala', ['milk']],
    ['giaourt', ['yogurt']],
    ['yaourt', ['yogurt']],
    ['tiri', ['cheese']],
    ['feta', ['feta']],
    ['psom', ['bread']],
    ['makaron', ['pasta', 'spaghetti']],
    ['krithar', ['orzo']],
    ['fake', ['lentil']],
    ['fasoli', ['bean']],
    ['revith', ['chickpea']],
    ['solom', ['salmon']],
    ['garid', ['shrimp']],
    ['psar', ['fish']],
    ['kalamar', ['squid', 'calamari']],
    ['htapod', ['octopus']],
    ['karid', ['walnut']],
    ['amigdal', ['almond']],
    ['elie', ['olive']],
    ['milo', ['apple']],
    ['banan', ['banana']],
    ['portokal', ['orange']],
    ['kafe', ['coffee', 'espresso']],
    ['sokolat', ['chocolate']],
    ['soup', ['soup']],
    ['salat', ['salad']],
    ['horiatik', ['horiatiki', 'greek salad']],
    ['pita', ['pita']],
    ['zomo', ['broth']],
    ['arak', ['peas']],
    ['fasolak', ['green beans']],
    ['bamie', ['okra']],
    ['aginar', ['artichoke']],
    ['pras', ['leek']],
    ['selin', ['celery']],
    ['kalabok', ['corn']],
    ['avokad', ['avocado']],
    ['brokol', ['broccoli']],
    ['vrom', ['oats']],
    ['kima', ['ground beef', 'bolognese', 'kima']],
    ['biftek', ['bifteki', 'burger']],
    ['giros', ['gyros']],
    ['giro', ['gyros']],
    ['mousak', ['moussaka', 'mousakas']],
    ['pastitsi', ['pastitsio']],
    ['avgolemon', ['avgolemono']],
    ['gemist', ['gemista']],
    ['baklav', ['baklava']],
    ['loukoum', ['loukoumades']],
    ['tiropit', ['tiropita', 'tyropita']],
    ['spanakopit', ['spanakopita']],
    ['fasolad', ['fasolada']],
    ['tzatzik', ['tzatziki']],
    ['dakos', ['dakos']],
    ['fava', ['fava']],
    ['souvlak', ['souvlaki']],
    ['zimar', ['pasta', 'italian pasta']],
    ['italik', ['italian pasta']],
    ['karbonar', ['carbonara']],
    ['bolonez', ['bolognese']],
    ['bolone', ['bolognese']],
    ['arabi', ['arrabbiata']],
    ['arrabi', ['arrabbiata']],
    ['pesto', ['pesto']],
    ['lazani', ['lasagna']],
    ['lasani', ['lasagna']],
    ['raviol', ['ravioli']],
    ['niok', ['gnocchi']],
    ['tortelin', ['tortellini']],
    ['penes', ['penne']],
    ['penn', ['penne']],
    ['taliatel', ['tagliatelle']],
    ['spaget', ['spaghetti']],
    ['alfred', ['alfredo']],
    ['amatrits', ['amatriciana']],
    ['poutanesk', ['puttanesca']],
    ['vongol', ['vongole']],
    ['tartouf', ['tartufo', 'truffle']],
    ['parmezan', ['parmesan']],
    ['pekorin', ['pecorino']],
    ['gorgonzol', ['gorgonzola']],
  ];

  function transliterateGreek(str) {
    let s = String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    for (const [gr, lat] of GREEK_DIGRAPHS) {
      if (s.includes(gr)) s = s.split(gr).join(lat);
    }
    let out = '';
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      out += GREEK_CHAR_MAP[ch] || ch;
    }
    return out;
  }

  function phoneticNormalize(str) {
    return transliterateGreek(str)
      .replace(/ch|kh/g, 'h')
      .replace(/ph/g, 'f')
      .replace(/mp/g, 'b')
      .replace(/nt/g, 'd')
      .replace(/gk|gg/g, 'g')
      .replace(/y/g, 'i')
      .replace(/([a-z])\1+/g, '$1')
      .trim();
  }

  const HAYSTACK_INDEX_CACHE = new Map();
  let lastQueryKey = '';
  let lastPreparedTokens = [];

  function getIndexedHaystack(haystack) {
    const key = String(haystack || '');
    let entry = HAYSTACK_INDEX_CACHE.get(key);
    if (!entry) {
      if (HAYSTACK_INDEX_CACHE.size > 4500) HAYSTACK_INDEX_CACHE.clear();
      entry = {
        low: key.toLowerCase(),
        phon: phoneticNormalize(key),
      };
      HAYSTACK_INDEX_CACHE.set(key, entry);
    }
    return entry;
  }

  function getPreparedQueryTokens(rawQuery) {
    const q = String(rawQuery || '').trim();
    if (q === lastQueryKey) return lastPreparedTokens;
    lastQueryKey = q;
    if (!q) {
      lastPreparedTokens = [];
      return lastPreparedTokens;
    }
    lastPreparedTokens = q
      .split(/\s+/)
      .filter(Boolean)
      .map((tok) => {
        const lowTok = tok.toLowerCase();
        const transTok = transliterateGreek(tok);
        const phonTok = phoneticNormalize(tok);
        const singularPhon = phonTok.length >= 4 && phonTok.endsWith('s') ? phonTok.slice(0, -1) : '';
        const aliasPhrases = [];
        for (const [stem, candidates] of GREEK_ALIASES) {
          const isInflectedMatch =
            phonTok.startsWith(stem) && phonTok.length - stem.length <= 3;
          const isPrefixTypeMatch =
            phonTok.length >= 4 && stem.startsWith(phonTok) && stem.length - phonTok.length <= 3;
          if (isInflectedMatch || isPrefixTypeMatch) {
            for (const c of candidates) {
              aliasPhrases.push({ low: c, phon: phoneticNormalize(c) });
            }
          }
        }
        return { lowTok, transTok, phonTok, singularPhon, aliasPhrases };
      });
    return lastPreparedTokens;
  }

  function matchesSearchQuery(haystack, rawQuery) {
    const tokens = getPreparedQueryTokens(rawQuery);
    if (tokens.length === 0) return true;

    const { low: hayLow, phon: hayPhon } = getIndexedHaystack(haystack);

    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (hayLow.includes(t.lowTok)) continue;
      if (t.transTok && hayLow.includes(t.transTok)) continue;
      if (t.phonTok && hayPhon.includes(t.phonTok)) continue;
      if (t.singularPhon && hayPhon.includes(t.singularPhon)) continue;

      let aliasHit = false;
      for (let j = 0; j < t.aliasPhrases.length; j += 1) {
        const ap = t.aliasPhrases[j];
        if (hayLow.includes(ap.low) || hayPhon.includes(ap.phon)) {
          aliasHit = true;
          break;
        }
      }
      if (!aliasHit) return false;
    }
    return true;
  }

  global.EuLogRecipes = {
    CURATED_RECIPES,
    getOriginalRecipeItems,
    resolveIngredient,
    computeRecipeTotals,
    summarizeRecipeChanges,
    buildMacroLine,
    buildRecipeDescription,
    buildFoodFromRecipeItems,
    ingredientToFood,
    getFoodSaltGrams,
    transliterateGreek,
    phoneticNormalize,
    matchesSearchQuery,
  };
})(window);
