export const categories = [
  {
    id: "chocolates",
    name: "Intimacy Chocolates",
    short: "Chocolates",
    image: "/images/chocolates.webp",
    detail: "Small-batch indulgences to savour together.",
  },
  {
    id: "gifts",
    name: "Gift Sets",
    short: "Gift Sets",
    image: "/images/gifts.webp",
    detail: "Beautifully paired keepsakes for your favourite person.",
  },
  {
    id: "candles",
    name: "Scented Candles",
    short: "Candles",
    image: "/images/candles.webp",
    detail: "Warm light and evocative scents for slow evenings.",
  },
  {
    id: "rituals",
    name: "Intimate Wellness",
    short: "Wellness",
    image: "/images/rituals.webp",
    detail: "A considered collection for moments of connection.",
  },
];
export const products = [
  {
    id: "noir-chocolate",
    name: "The Midnight Cacao Bar",
    category: "chocolates",
    price: 790,
    stock: 30,
    detail:
      "A dark chocolate bar with a lingering cocoa finish, wrapped in our signature blush sleeve.",
    spec: "70 g · Dark chocolate · Contains milk and soy. May contain nuts.",
    tag: "Bestseller",
  },
  {
    id: "evening-duet",
    name: "The Evening Duet Gift Set",
    category: "gifts",
    price: 2490,
    stock: 16,
    detail:
      "A gift box for two featuring signature dark chocolate and a scented candle, finished with a satin ribbon.",
    spec: "One 70 g chocolate bar and one 100 g candle · Gift box included",
    tag: "Signature",
  },
  {
    id: "velvet-flame",
    name: "Velvet Hour Candle",
    category: "candles",
    price: 1490,
    stock: 20,
    detail:
      "Amber, cedar and soft floral notes unfold as the room settles into candlelight.",
    spec: "180 g · Cotton wick · Keep burning candles within sight.",
    tag: "Bestseller",
  },
  {
    id: "afterglow-oil",
    name: "Afterglow Body Oil",
    category: "rituals",
    price: 1290,
    stock: 18,
    detail:
      "A silky body oil with a delicate botanical aroma for an unhurried evening ritual.",
    spec: "100 ml · For external body use · Patch test before use.",
    tag: "New",
  },
  {
    id: "rose-cacao",
    name: "Rose & Cacao Chocolate",
    category: "chocolates",
    price: 890,
    stock: 20,
    detail:
      "Dark chocolate meets fragrant rose in a delicately floral bar made for sharing.",
    spec: "70 g · Contains milk and soy. May contain nuts.",
    tag: "New",
  },
  {
    id: "slow-sunday",
    name: "The Slow Sunday Box",
    category: "gifts",
    price: 2990,
    stock: 12,
    detail:
      "A leisurely pairing of chocolate, body oil and candlelight, nestled inside our signature box.",
    spec: "70 g chocolate, 50 ml oil and 100 g candle · Gift packaging included",
    tag: "",
  },
].map((p) => ({
  ...p,
  image: categories.find((c) => c.id === p.category).image,
  active: true,
}));
export const settings = {
  announcement: "Complimentary shipping on orders above ₹1,499",
  shippingThreshold: 1499,
  shippingFee: 79,
  coupon: "CLOSER10",
  discount: 10,
  heroImage: "/images/hero.webp",
  eyebrow: "THE INTIMACY EDIT",
  headline: "A little closer.",
  italic: "A little sweeter.",
  subtitle:
    "Intimacy chocolates, thoughtful gifts and sensorial rituals for moments made for two.",
  cta: "Shop the collection",
  categories,
  heroSlides: [
    {
      eyebrow: "THE GIFT EDIT",
      headline: "For your",
      italic: "favourite person.",
      subtitle:
        "Discover signature gift sets, thoughtfully paired for shared celebrations.",
      cta: "Discover gift sets",
      category: "gifts",
      image: "/images/gifts.webp",
    },
    {
      eyebrow: "THE RITUAL EDIT",
      headline: "Make time",
      italic: "for each other.",
      subtitle:
        "Set the mood with warm candlelight and a little time together.",
      cta: "Explore candles",
      category: "candles",
      image: "/images/candles.webp",
    },
  ],
  story:
    "Go Winks is a boutique for the art of being close. Our edit brings together chocolate, candlelight and thoughtful gifts for couples who savour time together.",
  shipping:
    "Orders are packed discreetly. Delivery estimates and tracking become available once your parcel is booked with our delivery partner.",
  returns:
    "For damaged, incorrect or missing items, contact the store with your order reference and photos. Opened food and personal-care products are ineligible for change-of-mind returns.",
  contact:
    "For help with a purchase, send a message through your account. Include your order number so our team can find it.",
};
