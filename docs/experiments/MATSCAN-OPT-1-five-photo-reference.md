# MATSCAN-OPT-1 — five-photo benchmark reference (2026-10-09)

This reference is for human evaluation only, not an API result. User corrected image 4: **chicken, not fish**.

| Image order | Visual reference | Essential components to check |
|---|---|---|
| 1 | Burger and fries | Burger bun, patty, cheese, lettuce/tomato, fries, possible sauces |
| 2 | Kebab plate | Kebab meat, fries, vegetables, white and red sauces |
| 3 | Hawaiian pizza | Crust, cheese, ham, pineapple, tomato sauce |
| 4 | Chicken with rice and broccoli | **Chicken (not fish)**, white rice, broccoli, creamy sauce |
| 5 | Meat with small potatoes and green beans | Meat, potatoes, green beans, gravy/pan juices |

## Protocol
- Run the same five images against baseline and optimized prompts, preserving image detail.
- The benchmark script's baseline prompt is a **proxy**, not identical to the live production prompt; do not claim exact production cost comparison.
- Do not claim ingredient weights or nutrition values are ground truth: photographs alone cannot establish them.
- Compare classification (especially chicken vs fish), visible sauces, cooking method, missing components, token usage, food-bank match rate and total cost.
- Price assumptions are configurable; validate against actual model pricing and recorded usage.
- No production deploy, billing quota change or database migration is authorized by this reference.
