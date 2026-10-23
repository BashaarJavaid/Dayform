// Runtime switches (DESIGN §9), read at call time so tests can change process.env.
export const env = {
  demoMode: () => process.env.DEMO_MODE === "true",
  adminToken: () => process.env.ADMIN_TOKEN ?? "",
  understanding: () => (process.env.UNDERSTANDING === "server" ? "server" : "alexa") as "alexa" | "server",
  checkoutConfirm: () => (process.env.CHECKOUT_CONFIRM === "tool" ? "tool" : "elicitation") as "elicitation" | "tool",
  overnightMode: () => (process.env.OVERNIGHT_MODE === "live" ? "live" : "cached") as "live" | "cached",
  dbDriver: () => (process.env.DB_DRIVER === "data-api" ? "data-api" : "pg") as "pg" | "data-api",
};
