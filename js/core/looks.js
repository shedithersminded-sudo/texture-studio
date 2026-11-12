// Plastic colors for the Clear theme, like the tinted see-through handhelds.
// tint is the plastic color (r,g,b). accent is the matching highlight color.
export const PLASTICS = [
  ['clear', 'Ice Clear', '220,228,255', '#7c9cff'],
  ['smoke', 'Smoke Black', '30,33,40', '#b8c0d4'],
  ['atomic', 'Atomic Purple', '150,90,225', '#b98cff'],
  ['glacier', 'Glacier Blue', '80,165,255', '#5bb6ff'],
  ['jungle', 'Jungle Green', '40,175,110', '#3fd08f'],
  ['lime', 'Lime', '150,225,70', '#a2e35a'],
  ['tangerine', 'Tangerine', '255,140,50', '#ffa24d'],
  ['bubblegum', 'Bubblegum', '255,110,185', '#ff7ac1'],
  ['cherry', 'Cherry Red', '230,50,70', '#ff5d6e'],
];
export const plasticOf = id => PLASTICS.find(p => p[0] === id) || PLASTICS[0];
