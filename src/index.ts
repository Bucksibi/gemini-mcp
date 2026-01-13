#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Constants
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3-flash-preview";
const MAX_PROMPT_LENGTH = 500000; // ~500K chars, well under Gemini's 1M token limit
const MAX_CONTENT_LENGTH = 1000000; // 1M chars for summarize (large content)

// Valid Gemini models
const VALID_MODELS = [
  // Gemini 3 models
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3-pro-image-preview",
  // Gemini 2.5 models
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-pro-preview-05-06",
  // Gemini 2.0 models
  "gemini-2.0-flash",
] as const;

type ValidModel = typeof VALID_MODELS[number];

// Types
interface GeminiMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiRequest {
  contents: GeminiMessage[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: {
    message?: string;
    code?: number;
  };
}

// Zod schemas for runtime validation
const modelSchema = z.string().refine(
  (val): val is ValidModel => VALID_MODELS.includes(val as ValidModel),
  { message: `Invalid model. Valid options: ${VALID_MODELS.join(", ")}` }
).optional();

const analyzeArgsSchema = z.object({
  prompt: z.string().min(1, "prompt is required and cannot be empty").max(MAX_PROMPT_LENGTH, `prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`),
  context: z.string().max(MAX_CONTENT_LENGTH, `context exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`).optional(),
  model: modelSchema,
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string().min(1, "message content cannot be empty"),
});

const chatArgsSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, "messages array is required and cannot be empty"),
  model: modelSchema,
});

const summarizeArgsSchema = z.object({
  content: z.string().min(1, "content is required and cannot be empty").max(MAX_CONTENT_LENGTH, `content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`),
  focus: z.string().max(1000, "focus exceeds maximum length of 1000 characters").optional(),
  model: modelSchema,
});

// Get API key from environment
function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is required. " +
      "Get your API key from https://aistudio.google.com/apikey"
    );
  }
  return apiKey;
}

// Call Gemini API
async function callGemini(
  messages: GeminiMessage[],
  model: string = DEFAULT_MODEL,
  temperature: number = 0.7,
  maxTokens: number = 8192
): Promise<string> {
  const apiKey = getApiKey();
  const url = `${GEMINI_API_BASE}/${model}:generateContent`;

  const requestBody: GeminiRequest = {
    contents: messages,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;

  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message || "Unknown error"}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response content from Gemini");
  }

  return text;
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "gemini_analyze",
    description:
      "Send a prompt to Google Gemini for analysis. Use for code review, explanations, " +
      "research questions, or any task benefiting from Gemini's 1M token context window.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "The question or analysis request",
        },
        context: {
          type: "string",
          description: "Optional additional context (e.g., file contents, code)",
        },
        model: {
          type: "string",
          description: `Gemini model to use (default: ${DEFAULT_MODEL})`,
          default: DEFAULT_MODEL,
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "gemini_chat",
    description:
      "Multi-turn conversation with Gemini. Maintains conversation history for context-aware responses.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messages: {
          type: "array",
          description: "Array of conversation messages",
          items: {
            type: "object",
            properties: {
              role: {
                type: "string",
                enum: ["user", "model"],
                description: "Role of the message sender",
              },
              content: {
                type: "string",
                description: "Message content",
              },
            },
            required: ["role", "content"],
          },
        },
        model: {
          type: "string",
          description: `Gemini model to use (default: ${DEFAULT_MODEL})`,
          default: DEFAULT_MODEL,
        },
      },
      required: ["messages"],
    },
  },
  {
    name: "gemini_summarize",
    description:
      "Summarize large text or code using Gemini's 1M token context window. " +
      "Ideal for summarizing entire codebases, long documents, or extensive logs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The text or code to summarize",
        },
        focus: {
          type: "string",
          description:
            "Optional focus area (e.g., 'security issues', 'architecture', 'key functions')",
        },
        model: {
          type: "string",
          description: `Gemini model to use (default: ${DEFAULT_MODEL})`,
          default: DEFAULT_MODEL,
        },
      },
      required: ["content"],
    },
  },
];

// Tool handlers
async function handleGeminiAnalyze(args: unknown): Promise<string> {
  const validated = analyzeArgsSchema.parse(args);

  let fullPrompt = validated.prompt;
  if (validated.context?.trim()) {
    fullPrompt = `${validated.prompt}\n\n--- Context ---\n${validated.context}`;
  }

  const messages: GeminiMessage[] = [
    { role: "user", parts: [{ text: fullPrompt }] },
  ];

  return await callGemini(messages, validated.model || DEFAULT_MODEL);
}

async function handleGeminiChat(args: unknown): Promise<string> {
  const validated = chatArgsSchema.parse(args);

  const geminiMessages: GeminiMessage[] = validated.messages.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));

  return await callGemini(geminiMessages, validated.model || DEFAULT_MODEL);
}

async function handleGeminiSummarize(args: unknown): Promise<string> {
  const validated = summarizeArgsSchema.parse(args);

  let prompt = "Please provide a concise summary of the following content:\n\n";

  if (validated.focus?.trim()) {
    prompt = `Please summarize the following content, focusing specifically on: ${validated.focus}\n\n`;
  }

  prompt += validated.content;

  const messages: GeminiMessage[] = [
    { role: "user", parts: [{ text: prompt }] },
  ];

  return await callGemini(messages, validated.model || DEFAULT_MODEL, 0.5); // Lower temperature for summaries
}

// Create and run server
async function main() {
  const server = new Server(
    {
      name: "gemini-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case "gemini_analyze":
          result = await handleGeminiAnalyze(args);
          break;
        case "gemini_chat":
          result = await handleGeminiChat(args);
          break;
        case "gemini_summarize":
          result = await handleGeminiSummarize(args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      let errorMessage: string;
      if (error instanceof z.ZodError) {
        // Format Zod validation errors nicely
        errorMessage = error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup (to stderr so it doesn't interfere with MCP protocol)
  console.error("Gemini MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
