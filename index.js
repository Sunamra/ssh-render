// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve the client page (uses xterm.js from CDN)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
});

wss.on('connection', (ws) => {
  // Debug only for connection and errors
  ws.send('[DEBUG] New WebSocket client connected.\n');

  // Spawn a real PTY running bash (Linux)
  const shell = '/bin/bash';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  });

  // Forward PTY output to client
  ptyProcess.on('data', (data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  // Messages from client:
  // - JSON {type:'resize', cols, rows} -> resize pty
  // - otherwise treat as raw data to write into pty
  ws.on('message', (msg) => {
    // `msg` will be string (xterm sends plain strings) — attempt parse for resize
    let parsed = null;
    try {
      parsed = JSON.parse(msg);
    } catch (e) {
      parsed = null;
    }

    if (parsed && parsed.type === 'resize') {
      ptyProcess.resize(parsed.cols, parsed.rows);
    } else {
      // write raw data into PTY (preserves control/arrow keys/ctrl combos)
      ptyProcess.write(msg);
    }
  });

  ws.on('close', () => {
    try { ptyProcess.kill(); } catch (e) {}
  });

  ptyProcess.on('exit', (code) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`[DEBUG] Shell exited with code ${code}\n`);
      ws.close();
    }
  });

  ptyProcess.on('error', (err) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`[ERROR] PTY error: ${err.message}\n`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening at http://0.0.0.0:${PORT}`);
});
