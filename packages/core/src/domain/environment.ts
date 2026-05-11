import { z } from "zod";

export const applicationName = "jedidiah-platform";

export const nodeEnvValues = ["development", "test", "staging", "production"] as const;

export const NodeEnvSchema = z.enum(nodeEnvValues);

export type NodeEnv = z.infer<typeof NodeEnvSchema>;
