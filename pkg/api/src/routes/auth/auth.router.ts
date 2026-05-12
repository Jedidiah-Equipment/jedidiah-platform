import { protectedProcedure, publicProcedure, router } from "../../trpc/init.js";

export const authRouter = router({
  session: publicProcedure.query(({ ctx }) => ctx.session),
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),
});
