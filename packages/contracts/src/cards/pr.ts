import { z } from "zod";
import { Pr } from "../common.ts";

/** pr: PR celebration: lift, new estimated 1RM, change. Empty `prs` means no PR. */
export const PrCard = z.object({
  prs: z.array(Pr),
});
export type PrCard = z.infer<typeof PrCard>;
