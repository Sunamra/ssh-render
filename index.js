const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Serve simple HTML client with debug console
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="margin:0; height: 100vh;">
        <pre id="terminal" style="background:black;color:white;height:100vh;overflow:auto;white-space:pre-wrap;"></pre>
        <script>
          const term = document.getElementById('terminal');
          const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);

          function debug(msg) {
            term.textContent += "\\n[DEBUG] " + msg + "\\n";
            term.scrollTop = term.scrollHeight;
            console.log(msg);
          }

          ws.onopen = () => debug('WebSocket connection opened.');
          ws.onclose = () => debug('WebSocket connection closed.');
          ws.onerror = (e) => debug('WebSocket error: ' + e.message);

          ws.onmessage = (event) => {
            term.textContent += event.data;
            term.scrollTop = term.scrollHeight;
          };

          document.addEventListener('keydown', (e) => {
            e.preventDefault();
            let key = e.key;
            if (key === 'Enter') key = '\\n';
            if (key === 'Backspace') key = '\\b';
            ws.send(key);
          });
        </script>
      </body>
    </html>
  `);
});

wss.on('connection', (ws) => {
  ws.send('[DEBUG] New WebSocket client connected.');

  // Fallback to local shell if SSH is unavailable
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
    ws.send('[DEBUG] Spawn error: ' + err.message + '\n');
  });

  shell.on('close', (code) => {
    ws.send('[DEBUG] Shell process closed with code: ' + code + '\n');
    ws.close();
  });

  ws.on('message', (msg) => {
    ws.send('[DEBUG] Received input: ' + JSON.stringify(msg) + '\n');
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
