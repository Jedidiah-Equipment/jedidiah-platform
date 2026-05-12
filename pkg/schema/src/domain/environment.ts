import { z } from "zod";

export const nodeEnvValues = ["development", "test", "staging", "production"] as const;
export const NodeEnvSchema = z.enum(nodeEnvValues);
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

export const appEnvValues = ["development", "staging", "production"] as const;
export const AppEnvSchema = z.enum(appEnvValues);
export type AppEnv = z.infer<typeof AppEnvSchema>;
