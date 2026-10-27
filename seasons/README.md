# unco seasons

unco runs one theme all year (**"the warm, easy home"**) and rotates a seasonal look and collection on top of it. This folder is planning only; nothing here is built yet.

| Season | Dates (approx.) | Collection | Mood | Plan |
|---|---|---|---|---|
| Fall | Oct 1 – Nov 20 | **Warm & Easy** | Lamplight, caramel, wool | [fall.md](fall.md) |
| Holiday | Nov 21 – Dec 31 | **Give Easy** | Evergreen, cranberry, candle gold | [holiday.md](holiday.md) |
| Winter | Jan 1 – Feb 28 | **Rest & Reset** | Frost, slate, quiet mornings | [winter.md](winter.md) |
| Spring | Mar 1 – May 31 | **Easy Garden** | Sage, blossom, fresh soil | [spring.md](spring.md) |
| Summer | Jun 1 – Sep 30 | **Easy Outdoors** | Porch evenings, sun, lemonade | [summer.md](summer.md) |

Holiday gets its own short season because it's when this audience buys gifts, and it needs a different message ("for someone you love") from the rest of winter ("for yourself").

## Rules for every season

**The purple never changes.** `#453F78` (the current `--header` color) stays on:
- the header bar and the unco wordmark
- the main "buy" buttons (add to cart, checkout)
- focus outlines

Each season only swaps the supporting colors: the page background, accent, secondary color, text color, borders, and the tints on product cards. In [css/style.css](../css/style.css) that's roughly six CSS variables per season.

**Readability comes first.** This audience is 50+:
- Body text stays dark on a light background. Aim for a contrast ratio of at least 7:1 for body text and 4.5:1 for anything else readable.
- Bright seasonal colors (coral, gold, blossom pink) are for decoration only, never for text.
- Every animation is short and subtle, plays at most once per visit, and turns off for visitors whose device is set to reduce motion.

**Products** have to pass the same test as in [product-research.md](../product-research.md):
- useful, and clear from one photo
- good-looking, with no medical claims
- ships from a US warehouse when possible
- retails at $40 or more, or sells in a bundle that does, so the margin is at least 25% after about $10 of ads per sale

**Year-round items** stay in the store in every season. Only their spot on the homepage and their photo styling change:
- outdoor step handrail
- pet stairs
- contour neck pillow
- cling-film dispenser
- rolling overbed table

## Ideas that work in every season

- **Season switches by date**, with a small "This season at unco" note on the homepage so returning visitors notice the change.
- **"Larger text" toggle** in the header, remembered per visitor. It's genuinely useful for this audience and few stores offer it.
- **"Ships from the US in 1–3 days" badge** on every eligible product. Delivery speed is this audience's biggest worry.
- **Matching ads and site.** Facebook ads, emails and product photos use the current season's palette, so a click from an ad lands somewhere that looks the same.
- **One hero photo per season**: a real-feeling home scene, not a white-background product shot.
