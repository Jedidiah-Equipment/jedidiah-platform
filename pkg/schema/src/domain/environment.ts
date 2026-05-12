import { z } from "zod";

export const nodeEnvValues = ["development", "test", "staging", "production"] as const;
export type NodeEnv = z.infer<typeof NodeEnv>;
export const NodeEnv = z.enum(nodeEnvValues);

export const appEnvValues = ["development", "staging", "production"] as const;
export type AppEnv = z.infer<typeof AppEnv>;
export const AppEnv = z.enum(appEnvValues);
