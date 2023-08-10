import http from "http";
import express from "express";
import SocketIO from "socket.io";
import cors from "cors";

// variable
const PORT = 5000;
const app = express();
const waitingUsers = [];

// middleware
app.use(cors());

// routing
app.get("/api", (req, res) => {
  res.send({ title: "Hello" });
});

// app.set("view engine", "pug");
// app.set("views", __dirname + "/views");
// app.use("/public", express.static(__dirname + "/public"));
// app.get("/", (req, res) => res.render("home"));
// app.get("/*", (req, res) => res.redirect("/"));

const httpServer = http.createServer(app);
const ioServer = SocketIO(httpServer, {
  cors: {
    origin: "*",
    method: ["GET", "POST"],
  },
});

ioServer.on("connection", (socket) => {
  socket.on("request_random_chat", () => {
    console.log("request_random_chat");
    waitingUsers.push(socket);

    if (waitingUsers.length >= 2) {
      const userSocket2 = waitingUsers.pop();
      const userSocket1 = waitingUsers.pop();

      // 두 사용자를 같은 방으로 연결 (예: 'room-123')
      const roomName = `random_chat-${userSocket1.id}-${userSocket2.id}`;
      console.log(`roomName : ${roomName}`);
      userSocket1.join(roomName);
      userSocket2.join(roomName);
      // 두 사용자에게 상대방의 정보를 보내주거나, 'matched' 이벤트를 보내줄 수 있습니다.
      //   socket.to(roomName).emit("matched", roomName);
      //   userSocket1.emit("matched", roomName);
      userSocket1.emit("matched", roomName);
      userSocket2.emit("matched", roomName);

      userSocket1.emit("welcome");

      //   userSocket1.to(roomName).emit("matched", userSocket2.id, roomName);
      //   userSocket2.to(roomName).emit("matched", userSocket1.id, roomName);
      //   userSocket2.emit("matched", roomName);
    }
  });

  socket.on("join_room", (roomName) => {
    console.log(`join_room ${roomName} `);
    socket.join(roomName);
    socket.to(roomName).emit("welcome");
  });

  socket.on("offer", (offer, roomName) => {
    console.log("offer roomname " + roomName);
    socket.to(roomName).emit("offer", offer);
  });

  socket.on("answer", (answer, roomName) => {
    console.log("answer");
    socket.to(roomName).emit("answer", answer);
  });

  socket.on("ice", (ice, roomName) => {
    console.log(`ice : ${ice}`);
    socket.to(roomName).emit("ice", ice);
  });

  socket.on("stop_random_chat", () => {
    console.log("stop_random_chat");
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) {
      waitingUsers[index].disconnect();
      waitingUsers.splice(index, 1);
    }
    socket.broadcast.emit("user-disconnected", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("disconnect");
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) {
      waitingUsers.splice(index, 1);
      socket.broadcast.emit("user-disconnected", socket.id);
    }
  });
});

const handleListen = () => console.log("Listening on http://localhost:5000");
httpServer.listen(PORT, handleListen);
