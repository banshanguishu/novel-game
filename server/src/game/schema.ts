import { z } from "zod";

export const aiTurnSchema = z.object({
  title: z.string().min(2).max(30),
  location: z.string().min(2).max(40),
  chapterLabel: z.string().min(2).max(20),
  narrative: z.array(z.string().min(10).max(220)).min(2).max(4),
  summary: z.string().min(10).max(160),
  suggestedState: z
    .object({
      reputationDelta: z.number().int().min(-3).max(4),
      imperialFavorDelta: z.number().int().min(-2).max(3),
      peopleSupportDelta: z.number().int().min(-2).max(3),
      intrigueDelta: z.number().int().min(-2).max(4),
      militaryDelta: z.number().int().min(-2).max(3),
      wealthDelta: z.number().int().min(-2).max(3),
      imperialAuthorityDelta: z.number().int().min(0).max(3),
      factionProgressDelta: z.number().int().min(0).max(5),
      flagsToAdd: z.array(z.string().min(2).max(40)).max(4),
    })
    .strict(),
  choices: z
    .array(
      z.object({
        label: z.string().min(6).max(40),
        intent: z.enum(["power", "people", "caution", "emotion", "action"]),
      }).strict(),
    )
    .min(2)
    .max(4),
}).strict();

export type AiTurn = z.infer<typeof aiTurnSchema>;
