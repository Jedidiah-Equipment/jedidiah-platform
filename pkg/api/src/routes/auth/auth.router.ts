import { protectedProcedure, publicProcedure, router } from "../../trpc/init.js";

export const authRouter = router({
  access: protectedProcedure.query(({ ctx }) => ctx.access),
  session: publicProcedure.query(({ ctx }) => ctx.session),
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),
});
