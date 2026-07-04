// @companybrain/mcp — exposes companybrain domain ops to external AI agents over the
// Model Context Protocol (JSON-RPC over stdio). Consumed by VS Code, Claude Desktop,
// and any MCP-compatible host.

export { startMcpServer, type McpServerOptions } from './server.js';
export { TOOLS, findTool, type Tool, type ToolContext } from './tools.js';
