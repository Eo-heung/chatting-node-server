import { instrument } from "@socket.io/admin-ui";
import bodyParser from "body-parser";

const waitingUsers = [];
const OPENVIDU_URL = "https://eoheung.store/";
const OPENVIDU_SECRET = "MY_SECRET";
const OpenVidu = require("openvidu-node-client").OpenVidu;
const openvidu = new OpenVidu(OPENVIDU_URL, OPENVIDU_SECRET);

export function serverCameraChatting(ioServer, app) {
  const cors = require("cors");
  app.use(
    cors({
      origin: "*",
    })
  );
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  instrument(ioServer, {
    auth: false,
  });

  function findMatchingUser(currentSocket, index) {
    for (let i = 0; i < waitingUsers.length; i++) {
      if (i !== index) {
        const targetSocket = waitingUsers[i];
        console.log("current: " + currentSocket.selectedGender);
        console.log("target: " + targetSocket.userGender);

        // "모두"를 선택한 사용자끼리 매칭
        if (
          currentSocket.selectedGender === "any" &&
          targetSocket.selectedGender === "any"
        ) {
          return i;
        }

        // 성별을 특정하여 선택한 사용자끼리 매칭
        if (
          currentSocket.selectedGender === targetSocket.userGender &&
          currentSocket.userGender === targetSocket.selectedGender
        ) {
          return i;
        }
      }
    }
    return -1;
  }

  function matchUsers() {
    for (let i = waitingUsers.length - 1; i >= 0; i--) {
      const currentSocket = waitingUsers[i];
      const matchedIndex = findMatchingUser(currentSocket, i);

      if (matchedIndex !== -1) {
        const matchedSocket = waitingUsers[matchedIndex];

        // 매칭 로직...
        // currentSocket과 matchedSocket을 매칭합니다.
        const roomName = `random_chat-${currentSocket.id}-${matchedSocket.id}`;
        currentSocket.room = roomName;
        matchedSocket.room = roomName;
        currentSocket.join(roomName);
        matchedSocket.join(roomName);

        currentSocket.emit("matched", {
          roomName,
          opponentNickname: matchedSocket.nickname,
          opponentUserId: matchedSocket.userId,
        });
        matchedSocket.emit("matched", {
          roomName,
          opponentNickname: currentSocket.nickname,
          opponentUserId: currentSocket.userId,
        });

        currentSocket.emit("welcome");

        // 매칭된 사용자는 대기열에서 제거
        waitingUsers.splice(matchedIndex, 1);
        waitingUsers.splice(i, 1);

        i--; // 한 사용자를 제거했으므로 인덱스 조정
      }
    }
  }

  // function matchUsers() {
  //   if (waitingUsers.length >= 2) {
  //     const userSocket1 = waitingUsers.pop();
  //     const userSocket2 = waitingUsers.pop();

  //     const roomName = `random_chat-${userSocket1.id}-${userSocket2.id}`;
  //     userSocket1.room = roomName;
  //     userSocket2.room = roomName;

  //     userSocket1.join(roomName);
  //     userSocket2.join(roomName);

  //     userSocket1.emit("matched", {
  //       roomName,
  //       opponentNickname: userSocket2.nickname,
  //       opponentUserId: userSocket2.userId,
  //     });
  //     userSocket2.emit("matched", {
  //       roomName,
  //       opponentNickname: userSocket1.nickname,
  //       opponentUserId: userSocket1.userId,
  //     });

  //     userSocket1.emit("welcome");
  //     // socket.join(roomName); // 텍스트 채팅 방에 접속
  //     // userSocket2.emit("welcome"); // 필요하다면 이것도 추가할 수 있음
  //     // socket.to(roomName).emit("welcome", socket.nickname, countRoom(roomName));
  //     // ioServer.sockets.emit("room_change", publicRooms());
  //   }
  // }

  ioServer.on("connection", (socket) => {
    socket.onAny((event) => {
      // console.log(`Socket Event: ${event}`);
      socket.on("typing", (roomName) => {
        socket.to(roomName).emit("typing", socket.nickname);
      });
    });

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

    socket.on("nickname", (nickname) => (socket["nickname"] = nickname));

    socket.on("request_random_chat", (data) => {
      socket.nickname = data.nickname;
      socket.userId = data.userId;
      if (data.userGender == "1") {
        socket.userGender = "male";
      } else {
        socket.userGender = "female";
      }
      socket.selectedGender = data.selectedGender;

      waitingUsers.push(socket);
      console.log(socket.nickname);
      console.log(socket.userId);
      // console.log("해당성별 : " + socket.userGender);
      // console.log("원하는성별 : " + socket.selectedGender);
      // console.log("waitingUsers " + waitingUsers.length);
      // console.log(waitingUsers);

      // 2명이 대기열에 있을 때 매칭
      // if (waitingUsers.length >= 2) {
      matchUsers(); // 아래에 정의된 함수
      // }
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

    socket.on("reportUser", function (data) {
      const reportTime = socket.matchedTime; // 소켓 세션에서 시작 시간 가져오기
      socket.emit("fetchMatchedTime", { matchedTime: reportTime });
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
    const userId = req.query.userId;

    // console.log("Received nickname:", nickname, "userId:", userId);
    res.json({ status: "success", received: nickname, userId });
  });

  app.post("/api/sessions", async (req, res) => {
    var session = await openvidu.createSession(req.body);
    res.send(session.sessionId);
  });

  app.post("/api/sessions/:sessionId/connections", async (req, res) => {
    var session = openvidu.activeSessions.find(
      (s) => s.sessionId === req.params.sessionId
    );
    if (!session) {
      res.status(404).send();
    } else {
      var connection = await session.createConnection(req.body);
      res.send(connection.token);
    }
  });

  process.on("uncaughtException", (err) => console.error(err));
}
