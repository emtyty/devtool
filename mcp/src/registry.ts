import { z } from "zod";

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  summary?: string;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  execute: (input: any) => Promise<ToolResult>;
}
