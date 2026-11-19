// Trilho MCP server (stdio). Lets Claude and other MCP clients read and manage the
// local Trilho workspace: the same file the desktop app uses.
//
//   TRILHO_DATA_FILE  path to trilho.json (default: the desktop app's data folder)
//   TRILHO_AUTHOR     name shown on comments added through the connector (default: Claude)
//
// The hosted version (HTTP, same tools) lives in lambda.ts.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTrilhoServer } from './server';
import { dataFilePath, fileStore } from './storage';

const server = createTrilhoServer({
  store: fileStore(dataFilePath()),
  author: process.env.TRILHO_AUTHOR?.trim() || 'Claude',
});

await server.connect(new StdioServerTransport());
