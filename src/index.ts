#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Constants
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-preview-05-20";

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
async function handleGeminiAnalyze(args: {
  prompt: string;
  context?: string;
  model?: string;
}): Promise<string> {
  if (!args.prompt?.trim()) {
    throw new Error("prompt is required and cannot be empty");
  }

  let fullPrompt = args.prompt;
  if (args.context?.trim()) {
    fullPrompt = `${args.prompt}\n\n--- Context ---\n${args.context}`;
  }

  const messages: GeminiMessage[] = [
    { role: "user", parts: [{ text: fullPrompt }] },
  ];

  return await callGemini(messages, args.model || DEFAULT_MODEL);
}

async function handleGeminiChat(args: {
  messages: { role: "user" | "model"; content: string }[];
  model?: string;
}): Promise<string> {
  if (!args.messages || !Array.isArray(args.messages) || args.messages.length === 0) {
    throw new Error("messages array is required and cannot be empty");
  }

  const geminiMessages: GeminiMessage[] = args.messages.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));

  return await callGemini(geminiMessages, args.model || DEFAULT_MODEL);
}

async function handleGeminiSummarize(args: {
  content: string;
  focus?: string;
  model?: string;
}): Promise<string> {
  if (!args.content?.trim()) {
    throw new Error("content is required and cannot be empty");
  }

  let prompt = "Please provide a concise summary of the following content:\n\n";

  if (args.focus?.trim()) {
    prompt = `Please summarize the following content, focusing specifically on: ${args.focus}\n\n`;
  }

  prompt += args.content;

  const messages: GeminiMessage[] = [
    { role: "user", parts: [{ text: prompt }] },
  ];

  return await callGemini(messages, args.model || DEFAULT_MODEL, 0.5); // Lower temperature for summaries
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
          result = await handleGeminiAnalyze(args as Parameters<typeof handleGeminiAnalyze>[0]);
          break;
        case "gemini_chat":
          result = await handleGeminiChat(args as Parameters<typeof handleGeminiChat>[0]);
          break;
        case "gemini_summarize":
          result = await handleGeminiSummarize(args as Parameters<typeof handleGeminiSummarize>[0]);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
