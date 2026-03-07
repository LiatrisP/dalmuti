const CARD_IMAGE_MAP = {
  '1': '/cards/1.png',
  '2': '/cards/2.png',
  '3': '/cards/3.png',
  '4': '/cards/4.png',
  '5': '/cards/5.png',
  '6': '/cards/6.png',
  '7': '/cards/7.png',
  '8': '/cards/8.png',
  '9': '/cards/9.png',
  '10': '/cards/10.png',
  '11': '/cards/11.png',
  '12': '/cards/12.png',
  J: '/cards/J.png',
  J2: '/cards/J2.png'
};

export function getCardImageSrc(card, displayIndex = 0) {
  if (!card) return null;

  if (card.value === 'JOKER') {
    if (card.jokerVariant === 'J2') return CARD_IMAGE_MAP.J2;
    if (card.jokerVariant === 'J') return CARD_IMAGE_MAP.J;
    return displayIndex % 2 === 0 ? CARD_IMAGE_MAP.J : CARD_IMAGE_MAP.J2;
  }

  return CARD_IMAGE_MAP[String(card.value)] || null;
}

export function getCardLabel(card) {
  if (!card) return '?';
  if (card.value === 'JOKER') return 'Jester';
  return String(card.value);
}
