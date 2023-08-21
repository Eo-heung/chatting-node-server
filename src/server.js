import http from "http";
import express from "express";
import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import cors from "cors";
import bodyParser from "body-parser";

const PORT = 5000;
const app = express();
const waitingUsers = [];

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // URL-encoded 데이터 파싱을 위한 미들웨어(나중을 위해)

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

function matchUsers() {
  if (waitingUsers.length >= 2) {
    const userSocket1 = waitingUsers.pop();
    const userSocket2 = waitingUsers.pop();

    const roomName = `random_chat-${userSocket1.id}-${userSocket2.id}`;
    userSocket1.room = roomName;
    userSocket2.room = roomName;

    userSocket1.join(roomName);
    userSocket2.join(roomName);

    userSocket1.emit("matched", {
      roomName,
      opponentNickname: userSocket2.nickname,
    });
    userSocket2.emit("matched", {
      roomName,
      opponentNickname: userSocket1.nickname,
    });

    // socket.join(roomName); // 텍스트 채팅 방에 접속
    userSocket1.emit("welcome");
    // userSocket2.emit("welcome"); // 필요하다면 이것도 추가할 수 있음
    // socket.to(roomName).emit("welcome", socket.nickname, countRoom(roomName));
    // ioServer.sockets.emit("room_change", publicRooms());
  }
}

ioServer.on("connection", (socket) => {
  // socket["nickname"] = "Anon";
  socket.onAny((event) => {
    // console.log(ioServer.sockets.adapter);
    console.log(`Socket Event: ${event}`);
    socket.on("typing", (roomName) => {
      socket.to(roomName).emit("typing", socket.nickname);
    });
  });

  // socket.on("enter_room", (roomName, done) => {
  //   socket.join(roomName);
  //   done();
  //   socket.to(roomName).emit("welcome", socket.nickname, countRoom(roomName));
  //   ioServer.sockets.emit("room_change", publicRooms());
  // });

  // socket.on("disconnecting", () => {
  //   socket.rooms.forEach((room) =>
  //     socket.to(room).emit("bye", socket.nickname, countRoom(room) - 1)
  //   );
  // });

  socket.on("disconnect", () => {
    // 만약 랜덤 대기열에 사용자가 있을 경우 해당 사용자 제거
    const index = waitingUsers.indexOf(socket);
    if (index !== -1) {
      waitingUsers.splice(index, 1);
    }

    // 사용자가 현재 있는 방이라면
    if (socket.room) {
      // 해당 방에 남아있는 다른 사용자에게 연결 종료 메시지를 전송
      ioServer.to(socket.room).emit("user_disconnected");
      socket.leave(socket.room); // 사용자를 해당 방에서 제거
    }
  });

  socket.on("new_message", (msg, room, done) => {
    socket.to(room).emit("new_message", `${socket.nickname}: ${msg}`);
    done();
  });

  socket.on("nickname", (nickname) => (socket["nickname"] = nickname));

  socket.on("request_random_chat", (data) => {
    socket.nickname = data.nickname;
    waitingUsers.push(socket);
    console.log("waitingUsers " + waitingUsers.length);
    // console.log(waitingUsers);

    // 2명이 대기열에 있을 때 매칭
    if (waitingUsers.length >= 2) {
      matchUsers(); // 아래에 정의된 함수
    }
  });

  // socket.on("join_room", (roomName) => {
  //   socket.join(roomName);
  //   socket.to(roomName).emit("welcome");
  // });

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
      waitingUsers.splice(index, 1);
    }
    ioServer.to(socket.room).emit("user_disconnected");
    // socket.disconnect();
  });
});

app.get("/nickname", (req, res) => {
  const nickname = req.query.nickname;
  console.log("Received nickname:", nickname);
  res.json({ status: "success", received: nickname });
});

const handleListen = () => console.log(`Listening on http://localhost:${PORT}`);
httpServer.listen(PORT, handleListen);
