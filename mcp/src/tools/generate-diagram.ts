import { z } from "zod";
import { generateDiagramJSON } from "../../../utils/diagramParser.js";
import { buildSequenceMermaid, buildFlowchartMermaid } from "../../../utils/mermaidBuilder.js";
import type { Tool, ToolResult } from "../registry.js";

export const tool: Tool = {
  name: "generate_diagram",
  description:
    "Generate Mermaid diagram syntax from a plain English system description. Call this tool when the user asks to create a diagram, flowchart, sequence diagram, or architecture visualization from a text description. Parses entities (API, Database, Queue, S3, etc.) and their relationships (sends, stores, processes, etc.) into proper Mermaid syntax with typed node shapes and color styling. Supports two output types: 'flowchart' (system architecture with subgroups) and 'sequence' (interaction flow between participants). More accurate than writing Mermaid by hand because it auto-detects node types (database, queue, storage, service, client, external) and applies correct Mermaid shapes and styling.",
  schema: z.object({
    description: z
      .string()
      .describe(
        "Plain English description of the system or flow. Use proper nouns for components (e.g., 'API Gateway', 'Postgres', 'S3', 'Redis') and action verbs (e.g., 'sends', 'stores', 'processes', 'validates'). Example: 'User sends request to API Gateway. API Gateway validates token and forwards to Auth Service. Auth Service checks Redis cache then queries Postgres.'"
      ),
    type: z
      .enum(["flowchart", "sequence", "both"])
      .default("both")
      .describe(
        "Diagram type: 'flowchart' for architecture/system diagrams, 'sequence' for interaction/timeline diagrams, 'both' for both outputs (default)"
      ),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ description, type }): Promise<ToolResult> => {
    const desc = (description as string).trim();
    const diagramType = (type as string) || "both";

    if (!desc) {
      return {
        success: false,
        error:
          "Please provide a system description. Use proper nouns (API, Postgres, S3) and action verbs (sends, stores, processes).",
      };
    }

    try {
      const parsed = await generateDiagramJSON(desc);
      const result: Record<string, unknown> = {
        entities_found: parsed.flowchart.nodes.length,
        relationships_found: parsed.flowchart.edges.length,
      };

      const summaryParts: string[] = [
        `Found ${parsed.flowchart.nodes.length} components and ${parsed.flowchart.edges.length} relationships.`,
      ];

      if (diagramType === "flowchart" || diagramType === "both") {
        const flowchart = buildFlowchartMermaid(parsed.flowchart);
        result.flowchart = flowchart;
        summaryParts.push("", "=== FLOWCHART ===", flowchart);
      }

      if (diagramType === "sequence" || diagramType === "both") {
        const sequence = buildSequenceMermaid(parsed.sequence);
        result.sequence = sequence;
        summaryParts.push("", "=== SEQUENCE DIAGRAM ===", sequence);
      }

      result.nodes = parsed.flowchart.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
      }));

      result.edges = parsed.flowchart.edges.map((e) => ({
        from: e.from,
        to: e.to,
        label: e.label,
      }));

      return {
        success: true,
        data: result,
        summary: summaryParts.join("\n"),
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to parse system description.",
      };
    }
  },
};
