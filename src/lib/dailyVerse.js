const VERSES = [
  { ref: "Psalm 23:1", text: "The Lord is my shepherd; I shall not want." },
  { ref: "Psalm 23:4", text: "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me." },
  { ref: "Psalm 27:1", text: "The Lord is my light and my salvation; whom shall I fear? The Lord is the strength of my life; of whom shall I be afraid?" },
  { ref: "Psalm 28:7", text: "The Lord is my strength and my shield; my heart trusted in him, and I am helped." },
  { ref: "Psalm 31:24", text: "Be of good courage, and he shall strengthen your heart, all ye that hope in the Lord." },
  { ref: "Psalm 34:8", text: "O taste and see that the Lord is good: blessed is the man that trusteth in him." },
  { ref: "Psalm 37:5", text: "Commit thy way unto the Lord; trust also in him; and he shall bring it to pass." },
  { ref: "Psalm 46:1", text: "God is our refuge and strength, a very present help in trouble." },
  { ref: "Psalm 46:10", text: "Be still, and know that I am God." },
  { ref: "Psalm 91:1", text: "He that dwelleth in the secret place of the most High shall abide under the shadow of the Almighty." },
  { ref: "Psalm 91:11", text: "For he shall give his angels charge over thee, to keep thee in all thy ways." },
  { ref: "Psalm 100:4", text: "Enter into his gates with thanksgiving, and into his courts with praise." },
  { ref: "Psalm 118:24", text: "This is the day which the Lord hath made; we will rejoice and be glad in it." },
  { ref: "Psalm 119:105", text: "Thy word is a lamp unto my feet, and a light unto my path." },
  { ref: "Psalm 121:2", text: "My help cometh from the Lord, which made heaven and earth." },
  { ref: "Psalm 138:3", text: "In the day when I cried thou answeredst me, and strengthenedst me with strength in my soul." },
  { ref: "Psalm 144:1", text: "Blessed be the Lord my strength, which teacheth my hands to war, and my fingers to fight." },
  { ref: "Proverbs 3:5", text: "Trust in the Lord with all thine heart; and lean not unto thine own understanding." },
  { ref: "Proverbs 3:6", text: "In all thy ways acknowledge him, and he shall direct thy paths." },
  { ref: "Proverbs 4:23", text: "Keep thy heart with all diligence; for out of it are the issues of life." },
  { ref: "Proverbs 16:3", text: "Commit thy works unto the Lord, and thy thoughts shall be established." },
  { ref: "Proverbs 16:9", text: "A man's heart deviseth his way: but the Lord directeth his steps." },
  { ref: "Proverbs 18:10", text: "The name of the Lord is a strong tower: the righteous runneth into it, and is safe." },
  { ref: "Proverbs 29:25", text: "The fear of man bringeth a snare: but whoso putteth his trust in the Lord shall be safe." },
  { ref: "Proverbs 30:5", text: "Every word of God is pure: he is a shield unto them that put their trust in him." },
];

function getDayIndex() {
  const epoch = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((new Date() - epoch) / 86400000);
  return dayOfYear % VERSES.length;
}

export function getDailyVerse() {
  return VERSES[getDayIndex()];
}