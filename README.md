# Gemini MCP Server

MCP server that enables Claude Code to interact with Google's Gemini API directly.

## Features

- **gemini_analyze**: Send prompts for code review, explanations, research
- **gemini_chat**: Multi-turn conversations with context
- **gemini_summarize**: Summarize large codebases/documents (1M token window)

## Quick Start

```bash
# 1. Clone and build
git clone <this-repo> && cd gemini-mcp
npm install && npm run build

# 2. Set API key in ~/.zshrc
export GEMINI_API_KEY="your-key-here"
source ~/.zshrc

# 3. Add to ~/.claude.json (see config below)

# 4. Restart Claude Code
```

## Setup

### 1. Get Gemini API Key

Get your free API key from: https://aistudio.google.com/apikey

### 2. Set Environment Variable

Add to your `~/.zshrc` (or `~/.bashrc`):

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Then reload: `source ~/.zshrc`

### 3. Configure Claude Code

> **IMPORTANT:** Add to `~/.claude.json`, NOT `~/.claude/settings.json`

Add this to the `mcpServers` object in `~/.claude.json`:

```json
{
  "mcpServers": {
    "gemini-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/buckmike/Projects/gemini-mcp/build/index.js"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

Claude Code supports `${VAR}` syntax for environment variable expansion.

### 4. Restart Claude Code

Exit and relaunch Claude Code to load the new MCP server.

## Usage

Once configured, Claude can use these tools:

| Tool | Purpose |
|------|---------|
| `gemini_analyze` | Analyze code or answer questions using Gemini |
| `gemini_chat` | Have multi-turn conversations with context |
| `gemini_summarize` | Summarize large content (leverages 1M token window) |

## Available Models

| Model | Description |
|-------|-------------|
| `gemini-2.5-flash-preview-05-20` | Fast, efficient (default) |
| `gemini-2.5-pro-preview-05-06` | Best quality |
| `gemini-2.0-flash` | Stable release |

## Troubleshooting

### Tools Not Appearing After Restart

**Most Common Cause:** Config in wrong file.

| Wrong | Correct |
|-------|---------|
| `~/.claude/settings.json` | `~/.claude.json` |

Claude Code reads MCP servers from `~/.claude.json`, not the settings.json file in the .claude directory.

**Verification Steps:**

1. Check config location:
   ```bash
   cat ~/.claude.json | grep -A5 gemini-mcp
   ```

2. Verify API key is set:
   ```bash
   echo $GEMINI_API_KEY
   ```

3. Test server manually:
   ```bash
   echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | GEMINI_API_KEY="$GEMINI_API_KEY" node build/index.js
   ```

4. Restart Claude Code completely (exit and relaunch)

## Security

- API key stored in environment variable, never in code
- All inputs validated before API calls
- Errors handled gracefully

## Development

```bash
npm install      # Install dependencies
npm run build    # Compile TypeScript
npm run dev      # Watch mode for development
```
