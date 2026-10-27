// Optional per product:
// - squareVariationId: the item variation ID from your Square catalog. With
//   it, checkout uses Square's price for that item.
// - aliexpress: where to buy it for the customer, shown on the order desk
//   (#admin). url is the AliExpress product page; option is exactly what to
//   pick there, e.g.
//   aliexpress: { url: "https://www.aliexpress.us/item/1234567890.html", option: "Color: Black, 16ft" }
// - cj: the CJdropshipping variant to send paid orders to automatically.
//   vid is CJ's variant id for exactly the option you sell (see "CJ" in
//   worker/README.md for how to find it); sku is CJ's variant SKU, kept for
//   reference. Products without cj.vid are ordered by hand, e.g.
//   cj: { vid: "92511400-C758-4474-93CA-66D442F5F787", sku: "CJJJ1234567-Black-16ft" }
// - category: which seasonal collection the product belongs to (see
//   seasons/ on the product-research branch): "warm-easy", "easy-home",
//   "easy-garden" or "easy-pets".
//
// The first 8 products show on the home page, so keep the current season's
// heroes at the top.
const products = [
    {
        id: 0,
        name: "Wall-Mounted Electric Fireplace (36\")",
        price: 229.99,
        image: "images/fireplace.jpg",
        category: "warm-easy",
        cj: { vid: "1892086152427520003", sku: "CJFU229555003CX" }
    },
    {
        id: 1,
        name: "Heated Scarf, 3 Heat Settings",
        price: 54.99,
        image: "images/heated-neck-wrap.jpg",
        category: "warm-easy",
        cj: { vid: "1991094654539063298", sku: "CJWJ26076870001" }
    },
    {
        id: 2,
        name: "Wearable Heated Shawl",
        price: 79.99,
        image: "images/heated-shawl.jpg",
        category: "warm-easy",
        cj: { vid: "1871464783842676738", sku: "CJWJ225235001AZ" }
    },
    {
        id: 3,
        name: "Rolling Over-Bed Table, Adjustable Height",
        price: 99.99,
        image: "images/overbed-table.jpg",
        category: "easy-home",
        cj: { vid: "1873987701572263937", sku: "CJJT225784901AZ" }
    },
    {
        id: 4,
        name: "Contour Foam Pillow",
        price: 59.99,
        image: "images/neck-pillow.jpg",
        category: "warm-easy",
        cj: { vid: "1873635761382158339", sku: "CJJT225708402BY" }
    },
    {
        id: 5,
        name: "Heated Pet Pad",
        price: 49.99,
        image: "images/pet-heating-pad.jpg",
        category: "easy-pets",
        cj: { vid: "1879735114955853826", sku: "CJPM227205101AZ" }
    },
    {
        id: 6,
        name: "Outdoor Step Handrail (4–5 Steps)",
        price: 79.99,
        image: "images/step-handrail.jpg",
        category: "easy-home",
        cj: { vid: "1953076890508840961", sku: "CJJT244959901AZ" }
    },
    {
        id: 7,
        name: "Folding Wooden Pet Stairs",
        price: 69.99,
        image: "images/pet-stairs.jpg",
        category: "easy-pets",
        cj: { vid: "2036322004229218305", sku: "CJYL28016510001" }
    },
    {
        id: 8,
        name: "Linen Throw Pillow Covers (Set of 2)",
        price: 34.99,
        image: "images/pillow-covers.jpg",
        category: "warm-easy",
        cj: { vid: "1950800714679029761", sku: "CJJT244430101AZ" }
    },
    {
        id: 9,
        name: "Wrap, Foil & Paper Towel Dispenser",
        price: 54.99,
        image: "images/wrap-dispenser.jpg",
        category: "easy-home",
        cj: { vid: "1892400958048169985", sku: "CJCF229627801AZ" }
    },
    {
        id: 10,
        name: "Hands-Free Reading Magnifier (5×)",
        price: 39.99,
        image: "images/stand-magnifier.jpg",
        category: "easy-home",
        cj: { vid: "1797138395420962816", sku: "CJYD205179401AZ" }
    },
    {
        id: 11,
        name: "Garden Kneeler & Seat",
        price: 64.99,
        image: "images/garden-kneeler.jpg",
        category: "easy-garden",
        cj: { vid: "1956532057071439873", sku: "CJJT245765301AZ" }
    },
    {
        id: 12,
        name: "Self-Watering Raised Garden Bed",
        price: 64.99,
        image: "images/raised-garden-bed.jpg",
        category: "easy-garden",
        cj: { vid: "1955104915792494593", sku: "CJYL245365101AZ" }
    },
    {
        id: 13,
        name: "Solar Bird Bath with Lantern",
        price: 74.99,
        image: "images/solar-bird-bath.jpg",
        category: "easy-garden",
        cj: { vid: "1889520200887431169", sku: "CJTY228944101AZ" }
    }
];

// Lets the checkout Worker (worker/src/index.js) read the same prices
if (typeof module !== "undefined") {
    module.exports = products;
}
