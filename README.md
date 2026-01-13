# Gemini MCP Server

MCP server that enables Claude Code to interact with Google's Gemini API directly.

## Features

- **gemini_analyze**: Send prompts for code review, explanations, research
- **gemini_chat**: Multi-turn conversations with context
- **gemini_summarize**: Summarize large codebases/documents (1M token window)

## Setup

### 1. Get Gemini API Key

Get your free API key from: https://aistudio.google.com/apikey

### 2. Set Environment Variable

Add to your `~/.zshrc`:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Then reload: `source ~/.zshrc`

### 3. Configure Claude Code

Already configured in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": ["/Users/buckmike/Projects/gemini-mcp/build/index.js"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

### 4. Restart Claude Code

Restart to load the new MCP server.

## Usage

Once configured, Claude can use these tools:

```
gemini_analyze - Analyze code or answer questions using Gemini
gemini_chat - Have multi-turn conversations
gemini_summarize - Summarize large content
```

## Available Models

- `gemini-2.5-flash-preview-05-20` (default) - Fast, efficient
- `gemini-2.5-pro-preview-05-06` - Best quality
- `gemini-2.0-flash` - Stable release

## Security

- API key stored in environment variable, never in code
- All inputs validated before API calls
- Errors handled gracefully
