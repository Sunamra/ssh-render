const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Serve simple HTML client with blinking cursor and cleaner output
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          body, html {
            margin: 0; height: 100vh; background: black; color: white;
            font-family: monospace; white-space: pre-wrap; overflow: auto;
          }
          #terminal {
            padding: 10px;
          }
          #cursor {
            display: inline-block;
            width: 10px;
            background-color: white;
            animation: blink 1s step-start 0s infinite;
            vertical-align: bottom;
          }
          @keyframes blink {
            50% { background-color: transparent; }
          }
        </style>
      </head>
      <body>
        <div id="terminal"></div><div id="cursor"></div>
        <script>
          const term = document.getElementById('terminal');
          const cursor = document.getElementById('cursor');
          const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);

          ws.onopen = () => {
            appendDebug('[DEBUG] WebSocket connection opened.\\n');
          };
          ws.onclose = () => {
            appendDebug('\\n[DEBUG] WebSocket connection closed.\\n');
          };
          ws.onerror = (e) => {
            appendDebug('\\n[ERROR] WebSocket error: ' + e.message + '\\n');
          };

          ws.onmessage = (event) => {
            // Only show debug messages with [DEBUG] or [ERROR] prefix,
            // else append normally to terminal
            if (event.data.startsWith('[DEBUG]') || event.data.startsWith('[ERROR]') || event.data.startsWith('[SHELL ERROR]')) {
              appendDebug('\\n' + event.data + '\\n');
            } else {
              appendTerminal(event.data);
            }
          };

          function appendTerminal(text) {
            term.textContent += text;
            scrollToBottom();
          }

          function appendDebug(text) {
            term.textContent += text;
            scrollToBottom();
          }

          function scrollToBottom() {
            window.scrollTo(0, document.body.scrollHeight);
          }

          // Send keys on keydown, and prevent default to avoid browser shortcuts
          document.addEventListener('keydown', (e) => {
            e.preventDefault();

            let key = e.key;

            // Translate special keys to expected control characters
            if (key === 'Enter') key = '\\n';
            else if (key === 'Backspace') key = '\\x7f'; // DEL character for Backspace
            else if (key === 'Tab') key = '\\t';
            else if (key.length > 1) return; // Ignore other special keys (arrows, etc)

            ws.send(key);
          });
        </script>
      </body>
    </html>
  `);
});

wss.on('connection', (ws) => {
  ws.send('[DEBUG] New WebSocket client connected.');

  // Spawn shell process (bash or powershell)
  const shellCmd = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
  const shellArgs = [];

  const shell = spawn(shellCmd, shellArgs, {
    cwd: process.env.HOME || process.env.USERPROFILE,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  ws.send(`[DEBUG] Spawned local shell: ${shellCmd}\n`);

  shell.stdout.on('data', (data) => {
    ws.send(data.toString());
  });

  shell.stderr.on('data', (data) => {
    ws.send('[SHELL ERROR] ' + data.toString());
  });

  shell.on('error', (err) => {
    ws.send('[ERROR] Spawn error: ' + err.message + '\n');
  });

  shell.on('close', (code) => {
    ws.send('[DEBUG] Shell process closed with code: ' + code + '\n');
    ws.close();
  });

  ws.on('message', (msg) => {
    // Don't send debug for every key input anymore
    shell.stdin.write(msg);
  });

  ws.on('close', () => {
    shell.kill();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Shell proxy server running on http://localhost:${PORT}`);
});
