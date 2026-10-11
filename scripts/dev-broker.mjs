// Lokaler MQTT-Broker über WebSocket zum Testen des Spiels ohne Internet.
// Start: npm run broker   App öffnen mit: http://localhost:5173/?broker=ws://127.0.0.1:1884
// Zurück zum öffentlichen Broker: localStorage-Eintrag "swisscatch.mqtt.url" löschen.
import { Aedes } from 'aedes';
import { WebSocketServer, createWebSocketStream } from 'ws';

const PORT = Number(process.env.PORT ?? 1884);
const broker = await Aedes.createBroker();
const wss = new WebSocketServer({ port: PORT, handleProtocols: (p) => [...p][0] });
wss.on('connection', (ws) => broker.handle(createWebSocketStream(ws)));
broker.on('client', (c) => console.log('+', c.id));
broker.on('clientDisconnect', (c) => console.log('-', c.id));
console.log(`MQTT-Broker läuft auf ws://127.0.0.1:${PORT}`);
