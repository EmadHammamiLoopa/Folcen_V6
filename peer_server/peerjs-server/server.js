require('dotenv').config();
const express = require("express");
const { ExpressPeerServer } = require("peer");
const cors = require("cors");

// Initialize Express App
const app = express();

// Enable CORS for all requests
app.use(cors());

// Get port from environment variables (default: 9000)
const PORT = process.env.PORT || 9000;
const PEER_PATH = process.env.PEER_PATH || "/peerjs";

// ✅ Create HTTP Server
const server = require("http").createServer(app);

// ✅ Attach PeerJS Server
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: "/", // Ensure this matches the client's path
    allow_discovery: true
});

// ✅ Mount PeerJS on `/peerjs`
app.use("/peerjs", peerServer);

// ✅ Health check route
app.get("/", (req, res) => {
    res.send("✅ PeerJS Signaling Server is Running!");
});

// ✅ Start Server
server.listen(PORT, () => {
    console.log(`✅ PeerJS server is running at https://peerjs-whei.onrender.com/peerjs`);
});

// ✅ Log errors
peerServer.on("error", (err) => {
    console.error("❌ PeerJS Error:", err);
});

// ✅ Log generated peer IDs
peerServer.on("connection", (client) => {
    console.log(`✅ New peer connected with ID: ${client.getId()}`);
});

// ✅ Log when a peer disconnects
peerServer.on("disconnect", (client) => {
    console.log(`❌ Peer disconnected with ID: ${client.getId()}`);
});