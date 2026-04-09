import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getTopScores = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("scores")
      .withIndex("by_score")
      .order("desc")
      .take(10);
  },
});

export const submitScore = mutation({
  args: { name: v.string(), score: v.number() },
  handler: async (ctx, args) => {
    // Check if player name exists
    const existing = await ctx.db
      .query("scores")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    
    if (existing) {
       if (args.score > existing.score) {
          await ctx.db.patch(existing._id, { score: args.score });
       }
    } else {
       await ctx.db.insert("scores", { name: args.name, score: args.score });
    }
  },
});
