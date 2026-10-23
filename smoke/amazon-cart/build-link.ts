// Builds an Amazon Add-to-Cart link from asin:qty pairs.
// Usage: npx tsx smoke/amazon-cart/build-link.ts B089BWP51D:1 B08P6MF2D9:2
// Verified 2026-10-22 (user, signed in): the legacy /gp/aws/cart/add.html form lands on an EMPTY cart.
// The endpoint it redirects to, /associates/addtocart, fills the cart only when AssociateTag is present.
export const AMAZON_ASSOCIATE_TAG = "dayform-20";
export function buildCartLink(items: { asin: string; qty: number }[], tag = AMAZON_ASSOCIATE_TAG): string {
  const params = items.map(({ asin, qty }, i) => `ASIN.${i + 1}=${asin}&Quantity.${i + 1}=${qty}`);
  return `https://www.amazon.com/associates/addtocart?AssociateTag=${tag}&${params.join("&")}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const items = process.argv.slice(2).map((arg) => {
    const [asin, qty] = arg.split(":");
    if (!/^[A-Z0-9]{10}$/.test(asin ?? "") || !/^[1-9]\d*$/.test(qty ?? "")) {
      console.error(`Bad pair "${arg}". Expected ASIN:QTY, e.g. B089BWP51D:1`);
      process.exit(1);
    }
    return { asin, qty: Number(qty) };
  });
  if (items.length === 0) {
    console.error("Usage: npx tsx build-link.ts ASIN:QTY [ASIN:QTY ...]");
    process.exit(1);
  }
  console.log(buildCartLink(items));
}
