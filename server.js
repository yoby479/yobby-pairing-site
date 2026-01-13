const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

app.use(express.static('public')); // This loads the 'public' folder we made earlier

// Store active sessions
const activeSockets = {};

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('request_pairing', async (data) => {
        const phoneNumber = data.number;
        const sessionId = `session_${socket.id}`;
        console.log(`Requesting code for ${phoneNumber}`);

        try {
            const { state, saveCreds } = await useMultiFileAuthState(`auth_info_${sessionId}`);
            
            const sock = makeWASocket({
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                browser: ["TOXIC TECH YOBBY", "Chrome", "1.0"]
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                if (connection === 'open') {
                    io.to(socket.id).emit('status', 'Connected! Bot is running.');
                } else if (connection === 'close') {
                    io.to(socket.id).emit('status', 'Connection closed. Please retry.');
                }
            });

            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                    io.to(socket.id).emit('pairing_code', formattedCode);
                } catch (err) {
                    io.to(socket.id).emit('error', 'Failed to get code. Check number.');
                }
            }, 3000);

        } catch (error) {
            io.to(socket.id).emit('error', 'Server Error: ' + error.message);
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
