/* What's in each lair's hoard, counted by hand from Flight Rising (a hoard
   is private, so the page can't read it). Recount and replace a lair's list
   whenever it's out of date; "asOf" is the FR date it was counted.

   item: [FR item id, name, FR category, how many, sells for, food points,
          uses, note]
   uses: what Flight Rising itself lists the item as wanted for (USES on the
         page); note: anything else worth saying, in our own words. */
window.FR_HOARD = {
  danni: { asOf: "2026-10-28", items: [
    [2, "Nebula Floaters", "Seafood", 1, 35, 4, ["sophie"]],
    [4, "Aether Hermit", "Seafood", 5, 30, 3, []],
    [5, "Hardshell", "Insect", 1, 25, 3, ["den"]],
    [6, "Wasteland Pauper", "Insect", 4, 25, 3, []],
    [10, "Java Sparrow", "Meat", 4, 15, 2, ["swipp"]],
    [15, "Lucky Star", "Plant", 5, 15, 2, []],
    [18, "Crawdad", "Seafood", 3, 20, 2, []],
    [20, "Nightwing Bat", "Meat", 2, 20, 2, []],
    [24, "Crop Cutter", "Insect", 8, 20, 2, []],
    [41, "Salamander", "Meat", 4, 35, 4, []],
    [44, "Panther Anole", "Meat", 1, 15, 2, ["baldwin"]],
    [45, "Ashfall Prickler", "Plant", 5, 25, 3, ["sophie"]],
    [54, "White Lace Honeybee", "Insect", 7, 15, 2, []],
    [55, "Albino Dasher", "Insect", 4, 25, 3, []],
    [64, "Glass Minnows", "Seafood", 5, 15, 2, []],
    [65, "Mussels", "Seafood", 2, 20, 2, []],
    [66, "Sparkling Crayfish", "Seafood", 5, 20, 2, ["den"]],
    [69, "Pharaoh Ant", "Insect", 6, 15, 2, []],
    [80, "Desert Scrub", "Plant", 3, 15, 2, ["den"]],
    [103, "Water Bug", "Insect", 1, 45, 4, []],
    [117, "White Squirrel", "Meat", 4, 25, 3, []],
    [121, "Stinglash", "Insect", 2, 25, 3, ["baldwin"]],
    [123, "Maggot", "Insect", 10, 20, 2, []],
    [125, "Yellow Jumper", "Insect", 1, 35, 4, []],
    [131, "Winter's Delight", "Plant", 1, 25, 3, []],
    [155, "Leaf Beetle", "Insect", 8, 20, 2, ["baldwin"]],
    [160, "Shale Skitter", "Insect", 1, 25, 3, []],
    [165, "Jungle Grass", "Plant", 4, 15, 2, []],
    [172, "Balsas Anole", "Meat", 3, 15, 2, ["den"]],
    [173, "Glow Mushroom", "Plant", 4, 20, 2, ["swipp"]],
    [175, "Marsh Choker", "Plant", 2, 20, 2, []],
    [177, "Clay", "Minerals & Ores", 1, 15, 0, ["swipp", "den"], "A building material, dug up by Mining."],
    [893, "All-Seeing Shroom", "Holiday Items", 52, 0, 0, ["exchange"], "Riot of Rot festival currency: spend it at Festive Favors while the festival is on."],
    [3085, "Yellow-Tinged Featherduster", "Seafood", 1, 17, 2, ["den"]],
    [8106, "Dwarf Fawn", "Meat", 1, 17, 2, ["den"]],
    [35756, "Gold Lustre Vase", "Trinkets", 1, 35, 0, [], "Just a pretty trinket: nothing asks for it, so sell it or keep it."]
  ]},
  brendon: null
};
