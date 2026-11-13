// Character gallery page.
  import { avatarSvg, encodeAvatar, OUTFITS, OUTFIT_NAMES, randomAvatar, describeAvatar } from "/js/avatar.js";
  const colors = ["#FFB627", "#19D3C5", "#FF5D73", "#A78BFA"], rays = ["#FF5D73", "#A78BFA", "#FFB627", "#19D3C5"];
  const eyesFor = { dj: "shades", grad: "round", astro: "none", wizard: "stars" };
  const fig = (seed, cap, mood) => `<figure>${avatarSvg(seed, { size: 104, mood, label: cap })}<figcaption>${cap}</figcaption></figure>`;
  for (const [id, body] of [["minni", "spark"], ["bubbi", "bubble"]]) {
    document.getElementById(id).innerHTML = OUTFITS.map((o, i) => fig(encodeAvatar({ body, color: colors[i % 4], ray: rays[(i + 1) % 4], outfit: o, eyes: eyesFor[o] || "none" }), OUTFIT_NAMES[o])).join("");
  }
  const base = encodeAvatar({ body: "spark", color: "#FFB627", ray: "#FF5D73", outfit: "crown" });
  document.getElementById("moods").innerHTML = [["ready", "Ready"], ["wink", "Wink"], ["happy", "Correct!"], ["fire", "On fire"], ["hurry", "Hurry"], ["sad", "Not this time"]]
    .map(([m, c]) => `<figure><div class="avw react-${m === "fire" ? "fire" : m === "happy" ? "bounce" : m === "sad" ? "wobble" : "idle"}">${avatarSvg(base, { size: 104, mood: m, label: c })}</div><figcaption>${c}</figcaption></figure>`).join("");
  document.getElementById("random").innerHTML = Array.from({ length: 18 }, () => { const s = randomAvatar(); return fig(s, describeAvatar(s)); }).join("");
