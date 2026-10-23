// Generates foods.txt: 1,500 plausible food names (desi dishes + generic foods + prepared variants).
import { writeFileSync } from "node:fs";

const desi = `roti, chapati, paratha, aloo paratha, gobi paratha, naan, garlic naan, butter naan, puri, kulcha, tandoori roti, missi roti, makki ki roti,
chicken karahi, mutton karahi, chicken handi, chicken tikka, chicken tikka masala, butter chicken, chicken korma, mutton korma, nihari, haleem,
chicken biryani, mutton biryani, beef biryani, sindhi biryani, vegetable biryani, pulao, chicken pulao, yakhni pulao, daal, daal chawal, daal makhani,
daal mash, chana daal, masoor daal, moong daal, chana masala, aloo gobi, aloo matar, palak paneer, saag, sarson ka saag, bhindi masala, baingan bharta,
keema, aloo keema, matar keema, seekh kebab, shami kebab, chapli kebab, bihari kebab, tandoori chicken, chicken jalfrezi, paya, kofta, nargisi kofta,
samosa, pakora, aloo tikki, chaat, dahi bhalla, gol gappa, raita, kheer, gulab jamun, jalebi, halwa, gajar halwa, suji halwa, ras malai, barfi,
lassi, sweet lassi, mango lassi, chai, doodh patti, kashmiri chai, paratha roll, chicken roll, anda paratha, halwa puri, channay, lahori chanay,
kadhi pakora, qorma, dum pukht, sajji, tawa chicken, karahi gosht, achar gosht, bhuna gosht, dahi, khichdi, sooji, zarda, falooda, kulfi`;

const generic = `apple, banana, orange, grapes, strawberries, blueberries, raspberries, mango, pineapple, watermelon, cantaloupe, pear, peach, plum,
cherries, kiwi, papaya, pomegranate, guava, dates, figs, apricot, avocado, lemon, lime, grapefruit, coconut, raisins, prunes,
broccoli, spinach, kale, lettuce, cabbage, cauliflower, carrot, cucumber, tomato, onion, garlic, potato, sweet potato, peas, green beans,
corn, zucchini, eggplant, bell pepper, mushrooms, celery, asparagus, beetroot, okra, pumpkin, radish, turnip, brussels sprouts,
chicken breast, chicken thigh, chicken wings, ground beef, beef steak, lamb chops, mutton, pork chop, bacon, ham, turkey breast, salmon,
tuna, cod, tilapia, shrimp, sardines, mackerel, egg, egg white, tofu, tempeh, lentils, chickpeas, black beans, kidney beans, edamame,
white rice, brown rice, basmati rice, quinoa, oats, oatmeal, bread, whole wheat bread, white bread, bagel, pasta, spaghetti, macaroni,
couscous, barley, tortilla, croissant, muffin, pancake, waffle, cereal, granola, cornflakes, crackers,
milk, skim milk, yogurt, greek yogurt, cheddar cheese, mozzarella, cottage cheese, paneer, butter, ghee, cream, ice cream, cream cheese,
almonds, walnuts, cashews, peanuts, pistachios, peanut butter, almond butter, chia seeds, flax seeds, sunflower seeds, pumpkin seeds,
olive oil, vegetable oil, mayonnaise, ketchup, honey, sugar, jam, dark chocolate, milk chocolate, protein bar, whey protein, protein shake,
pizza, burger, cheeseburger, hot dog, french fries, sandwich, club sandwich, burrito, taco, sushi, ramen, fried rice, noodles, lasagna,
mac and cheese, caesar salad, garden salad, chicken soup, tomato soup, lentil soup, omelette, scrambled eggs, boiled egg, fried egg,
orange juice, apple juice, coffee, latte, cappuccino, green tea, black tea, cola, diet cola, sports drink, coconut water, smoothie,
popcorn, potato chips, pretzels, cookies, brownie, cake, cheesecake, donut, apple pie, rice cake, hummus, falafel, pita bread, guacamole`;

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const names = new Set<string>([...split(desi), ...split(generic)]);

const proteins = ["chicken", "beef", "lamb", "mutton", "fish", "prawn", "egg", "paneer", "tofu", "turkey", "salmon", "pork"];
const dishes = ["curry", "masala", "fry", "kebab", "wrap", "salad", "soup", "stir fry", "sandwich", "pulao", "biryani", "karahi", "korma", "tikka", "burger", "rice bowl", "noodles", "pasta"];
for (const p of proteins) for (const d of dishes) names.add(`${p} ${d}`);

const veg = ["aloo", "gobi", "matar", "palak", "bhindi", "baingan", "mushroom", "mixed vegetable", "lauki", "tinda", "karela", "arvi"];
const vegDish = ["sabzi", "curry", "bhujia", "masala", "pakora", "paratha"];
for (const v of veg) for (const d of vegDish) names.add(`${v} ${d}`);

const methods = ["grilled", "baked", "fried", "boiled", "steamed", "roasted", "raw", "canned", "frozen", "dried"];
for (const g of split(generic)) for (const m of methods) {
  if (names.size >= 1500) break;
  names.add(`${g}, ${m}`);
}
const list = [...names].slice(0, 1500);
if (list.length !== 1500) throw new Error(`only ${list.length} names`);
writeFileSync(new URL("./foods.txt", import.meta.url), list.join("\n") + "\n");
console.log(`wrote ${list.length} names`);
