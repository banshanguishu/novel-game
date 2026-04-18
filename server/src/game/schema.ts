import { z } from "zod";

export const aiTurnSchema = z.object({
  title: z.string().min(2).max(40),
  location: z.string().min(2).max(60),
  chapterLabel: z.string().min(2).max(30),
  narrative: z.array(z.string().min(5).max(500)).min(1).max(6),
  summary: z.string().min(4).max(300),
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
      flagsToAdd: z.array(z.string().min(2).max(60)).max(6),
    })
    .strict(),
  choices: z
    .array(
      z.object({
        label: z.string().min(4).max(60),
        intent: z.enum(["power", "people", "caution", "emotion", "action"]),
      }).strict(),
    )
    .min(2)
    .max(4),
}).strict();

export type AiTurn = z.infer<typeof aiTurnSchema>;

export const chapterSummaryResponseSchema = z.object({
  summary: z.string().min(50).max(500),
  keyEvents: z.array(z.string().min(2).max(40)).min(1).max(6),
  npcUpdates: z.array(
    z.object({
      npcId: z.string().min(1),
      attitude: z.string().min(1).max(20),
      relationship: z.string().min(2).max(60),
      visible: z.boolean(),
    }),
  ).max(8),
  unresolvedHooks: z.array(z.string().min(4).max(80)).max(6),
}).strict();

export type ChapterSummaryResponse = z.infer<typeof chapterSummaryResponseSchema>;
