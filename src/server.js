import http from "http";
import express from "express";
import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import cors from "cors";

const PORT = 5000;
const app = express();
const waitingUsers = [];

// Middleware
app.use(cors());

// Routing
app.get("/api", (req, res) => {
  res.send({ title: "Hello" });
});

const httpServer = http.createServer(app);

const ioServer = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

instrument(ioServer, {
  auth: false,
});

function publicRooms() {
  const {
    sockets: {
      adapter: { sids, rooms },
    },
  } = ioServer;
  const publicRooms = [];
  rooms.forEach((_, key) => {
    if (sids.get(key) === undefined) {
      publicRooms.push(key);
    }
  });
  return publicRooms;
}

function countRoom(roomName) {
  return ioServer.sockets.adapter.rooms.get(roomName)?.size;
}

ioServer.on("connection", (socket) => {
  socket["nickname"] = "Anon";

  socket.onAny((event) => {
    console.log(ioServer.sockets.adapter);
    console.log(`Socket Event: ${event}`);
  });

  socket.on("enter_room", (roomName, done) => {
    socket.join(roomName);
    done();
    socket.to(roomName).emit("welcome", socket.nickname, countRoom(roomName));
    ioServer.sockets.emit("room_change", publicRooms());
  });

  socket.on("disconnecting", () => {
    socket.rooms.forEach((room) =>
      socket.to(room).emit("bye", socket.nickname, countRoom(room) - 1)
    );
  });

  socket.on("disconnect", () => {
    ioServer.sockets.emit("room_change", publicRooms());
  });

  socket.on("new_message", (msg, room, done) => {
    socket.to(room).emit("new_message", `${socket.nickname}: ${msg}`);
    done();
  });

  socket.on("nickname", (nickname) => (socket["nickname"] = nickname));

  socket.on("request_random_chat", () => {
    waitingUsers.push(socket);
    if (waitingUsers.length >= 2) {
      const userSocket2 = waitingUsers.pop();
      const userSocket1 = waitingUsers.pop();
      const roomName = `random_chat-${userSocket1.id}-${userSocket2.id}`;
      userSocket1.join(roomName);
      userSocket2.join(roomName);
      userSocket1.emit("matched", roomName);
      userSocket2.emit("matched", roomName);
      userSocket1.emit("welcome");
    }
  });

  socket.on("join_room", (roomName) => {
    socket.join(roomName);
    socket.to(roomName).emit("welcome");
  });

  socket.on("offer", (offer, roomName) => {
    socket.to(roomName).emit("offer", offer);
  });

  socket.on("answer", (answer, roomName) => {
    socket.to(roomName).emit("answer", answer);
  });

  socket.on("ice", (ice, roomName) => {
    socket.to(roomName).emit("ice", ice);
  });

  socket.on("stop_random_chat", () => {
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) {
      waitingUsers[index].disconnect();
      waitingUsers.splice(index, 1);
    }
    socket.broadcast.emit("user-disconnected", socket.id);
  });
});

const handleListen = () => console.log(`Listening on http://localhost:${PORT}`);
httpServer.listen(PORT, handleListen);
