const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Serve a simple HTML client for SSH access
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="margin:0; height: 100vh;">
        <pre id="terminal" style="background:black;color:white;height:100vh;overflow:auto;white-space:pre-wrap;"></pre>
        <script>
          const term = document.getElementById('terminal');
          const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
          ws.onmessage = (event) => {
            term.textContent += event.data;
            term.scrollTop = term.scrollHeight;
          };
          document.addEventListener('keydown', (e) => {
            e.preventDefault();
            let key = e.key;
            if (key === 'Enter') key = '\n';
            if (key === 'Backspace') key = '\b';
            ws.send(key);
          });
        </script>
      </body>
    </html>
  `);
});

wss.on('connection', (ws) => {
  // Configure for Linux: connect to localhost SSH
  const shell = spawn('ssh', ['-tt', 'user@localhost'], {
    cwd: process.env.HOME,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  shell.stdout.on('data', (data) => {
    ws.send(data.toString());
  });

  shell.stderr.on('data', (data) => {
    ws.send(data.toString());
  });

  ws.on('message', (msg) => {
    shell.stdin.write(msg);
  });

  shell.on('close', () => {
    ws.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SSH proxy server running on http://localhost:${PORT}`);
});
