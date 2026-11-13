// Fun nickname generator: superhero titles + tasty or silly things.
// Shared by the browser and the Worker. Every name fits the 16-character limit.

const TITLES = [
  "Captain", "Super", "Turbo", "Mighty", "Ninja", "Cosmic", "Disco", "Professor", "Agent", "Rocket",
  "Thunder", "Doctor", "Mega", "Sir", "Lady", "Boss", "Hyper", "Wonder", "Iron", "Flying",
  "Sneaky", "Dancing", "Sleepy", "Spicy", "Royal", "Laser", "Mystic", "Atomic", "Jolly", "Wild",
];
const THINGS = [
  "Dosa", "Idli", "Vada", "Laddu", "Mango", "Samosa", "Kulfi", "Jalebi", "Payasam", "Murukku",
  "Biryani", "Chutney", "Pongal", "Rasam", "Sambar", "Appam", "Halwa", "Parotta",
  "Semla", "Fika", "Meatball", "Moose", "Lingonberry", "Kanelbulle",
  "Penguin", "Panda", "Llama", "Tiger", "Peacock", "Elephant", "Koala", "Otter", "Pickle", "Noodle",
  "Comet", "Rocket", "Coconut", "Cupcake", "Waffle", "Muffin",
];
const ALL = [];
for (const t of TITLES) for (const n of THINGS) { const name = `${t} ${n}`; if (name.length <= 16 && t !== n) ALL.push(name); }
export const FUN_NAMES = ALL;

export function funName(exclude = new Set()) {
  for (let i = 0; i < 40; i++) {
    const n = ALL[Math.floor(Math.random() * ALL.length)];
    if (!exclude.has(n.toLowerCase())) return n;
  }
  return ALL[Math.floor(Math.random() * ALL.length)];
}

export function funNames(count = 3) {
  const out = [], seen = new Set();
  while (out.length < count) { const n = funName(seen); seen.add(n.toLowerCase()); out.push(n); }
  return out;
}
