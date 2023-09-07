import http from "http";
import express from "express";
import { Server } from "socket.io";
import bodyParser from "body-parser";
import { serverCameraChatting } from "./serverCameraChatting";
import { serverTextChatting } from "./serverTextChatting";

const PORT = 4000;
const app = express();

// const cors = require("cors");

// app.use(
//   cors({
//     origin: "*",
//   })
// );

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const httpServer = http.createServer(app);

const ioServer = new Server(httpServer);

// , {
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"],
//   },
// }

httpServer.listen(PORT, () => {
  console.log("Application started on port: ", PORT);
});

serverCameraChatting(ioServer, app);
serverTextChatting(ioServer, app);
