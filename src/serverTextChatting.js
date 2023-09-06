import { instrument } from "@socket.io/admin-ui";
import db from "./connect";
import bodyParser from "body-parser";

export function serverTextChatting(ioServer, app) {
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
    // socket["nickname"] = "Anon";
    socket.onAny((event) => {
      // console.log(`Socket Event: ${event}`);

      socket.on("typing", (roomName) => {
        socket.to(roomName).emit("typing", socket.nickname);
      });
    });

    socket.on("enter_room", (roomName, done) => {
      socket.join(roomName);
      done();
      socket
        .to(roomName)
        .emit("welcome", socket.nickname, socket.userId, countRoom(roomName));
      ioServer.sockets.emit("room_change", publicRooms());
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach((room) =>
        socket
          .to(room)
          .emit("bye", socket.nickname, socket.userId, countRoom(room) - 1)
      );
    });

    socket.on("disconnect", () => {
      ioServer.sockets.emit("room_change", publicRooms());
    });

    socket.on("new_message", (msg, room, done) => {
      socket.to(room).emit("new_message", `${msg}`);
      // socket.to(room).emit("new_message", `${socket.nickname}: ${msg}`);
      done();
    });

    socket.on("nickname", (nickname) => (socket["nickname"] = nickname));

    socket.on("join_room", (roomName) => {
      socket.join(roomName);
      socket.to(roomName).emit("welcome");
    });

    app.get("/nickname", (req, res) => {
      const nickname = req.query.nickname;
      const userId = req.query.userId;
      // console.log("Received nickname:", nickname, "userId:", userId);
      res.json({ status: "success", received: nickname, userId });
    });
  });

  app.post("/getUnreadMessages", (req, res) => {
    const myUserId = req.body.myUserId;
    const friendUserIds = req.body.friendUserIds;

    if (!myUserId || !Array.isArray(friendUserIds)) {
      return res.json({ status: "error", message: "Invalid input" });
    }

    getUnreadMessages(myUserId, friendUserIds, res);
  });

  app.post("/getRecentMessages", (req, res) => {
    const { myUserId, friendId } = req.body;
    // socket을 대신하여 res 객체를 사용
    findAndGetMessages(myUserId, friendId, res);
  });

  // "/sendMessage" 경로로 POST 요청이 들어오면 실행되는 라우터입니다.

  app.post("/sendMessage", (req, res) => {
    // 클라이언트에서 보내는 JSON 데이터를 파싱하여 변수에 저장합니다.
    const { myUserId, friendId, message } = req.body;
    console.log(myUserId, friendId);
    console.log(message);
    // 두 사용자의 ID를 알파벳순으로 정렬합니다. 이렇게 하면 roomName을 일관되게 유지할 수 있습니다.
    const sortedUserIds = [myUserId, friendId].sort();
    const sortedRoomName = `${sortedUserIds[0]}-${sortedUserIds[1]}`;
    const clientsInRoom = ioServer.sockets.adapter.rooms.get(sortedRoomName);
    const timestamp = new Date().toISOString().split("T")[0];

    let senderIsRead = true;
    let receiverIsRead = false;

    // 해당 roomName에 대한 룸 ID를 데이터베이스에서 찾습니다.
    const findRoomQuery = `SELECT id FROM CHATTING_ROOMNAME WHERE roomName = ?`;
    db.query(findRoomQuery, [sortedRoomName], (err, results) => {
      // SQL 쿼리 실행 중 오류가 발생하면 500 에러를 반환합니다.
      if (err) {
        console.error(err);
        res
          .status(500)
          .json({ status: "error", message: "Internal Server Error" });
        return;
      }

      // 룸이 없을 경우 404 에러를 반환합니다.
      if (results.length === 0) {
        console.error("룸을 찾을 수 없습니다.");
        res.status(404).json({ status: "error", message: "룸 없음" });
        return;
      }

      // 룸이 있을 경우 룸 ID를 추출합니다.
      const roomId = results[0].id;

      // 추출한 룸 ID와 메시지 내용을 사용하여 메시지를 데이터베이스에 저장합니다.
      const insertMessageQuery = `
      INSERT INTO MESSAGE (room_id, message, senderIsRead, receiverIsRead, timestamp, senderId)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
      db.query(
        insertMessageQuery,
        [
          roomId,
          JSON.stringify(message),
          senderIsRead,
          receiverIsRead,
          timestamp,
          myUserId,
        ],
        (err, results) => {
          // SQL 쿼리 실행 중 오류가 발생하면 500 에러를 반환합니다.
          if (err) {
            console.error(err);
            res
              .status(500)
              .json({ status: "error", message: "Internal Server Error" });
            return;
          }

          // 메시지 저장이 성공하면 성공 응답을 반환합니다.
          res.json({
            status: "success",
            message: "Message inserted successfully",
          });
        }
      );
    });
  });
}

function findAndGetMessages(myUserId, friendId, res) {
  // userId를 알파벳 순으로 정렬합니다.
  const sortedUserIds = [myUserId, friendId].sort();
  const sortedRoomName = `${sortedUserIds[0]}-${sortedUserIds[1]}`;

  // CHATTING_ROOMNAME 테이블에서 룸을 찾습니다.
  const findRoomQuery = `SELECT id FROM CHATTING_ROOMNAME WHERE roomName = ?`;
  db.query(findRoomQuery, [sortedRoomName], (err, results) => {
    // res.json({ status: "success", received: results });
    if (err) throw err;
    if (results.length > 0) {
      const roomId = results[0].id;
      // MESSAGE 테이블에서 최근 3일간의 메세지를 찾습니다.
      const findMessagesQuery = `
          SELECT * FROM MESSAGE
          WHERE room_id = ? AND timestamp >= NOW() - INTERVAL 3 DAY
          ORDER BY id ASC
        `;
      db.query(findMessagesQuery, [roomId], (err, messages) => {
        if (err) throw err;

        // 메시지를 읽었다는 것을 데이터베이스에 업데이트
        const updateReadStatusQuery = `
            UPDATE MESSAGE SET receiverIsRead = 1 
            WHERE room_id = ? AND receiverIsRead = 0;
        `;
        db.query(updateReadStatusQuery, [roomId], (err, results) => {
          if (err) throw err;

          // "읽음" 상태를 실시간으로 알림
          // ioServer.to(sortedRoomName).emit("message_read", myUserId);

          // 기존 메세지 응답 로직
          res.json({ status: "success", received: messages });
        });
      });
    } else {
      console.error("룸을 찾을 수 없어요.");
      res.json({ status: "error", message: "룸 없음" });
      return;
    }
  });
}

function getUnreadMessages(myUserId, friendUserIds, res) {
  const roomNames = friendUserIds.map((friendId) => {
    const sortedUserIds = [myUserId, friendId].sort();
    return `${sortedUserIds[0]}-${sortedUserIds[1]}`;
  });

  // 룸 아이디들을 찾기
  const findRoomQuery = `SELECT id, roomName FROM CHATTING_ROOMNAME WHERE roomName IN (?)`;
  db.query(findRoomQuery, [roomNames], (err, rooms) => {
    if (err) throw err;

    if (rooms.length > 0) {
      const roomIds = rooms.map((room) => room.id);

      //       // 안 읽은 메세지 개수 찾기
      //       const findUnreadQuery = `
      //       SELECT COUNT(*) AS unreadCount, room_id FROM MESSAGE
      //       WHERE room_id IN (?) AND receiverIsRead = 0 AND senderId = ?
      //       GROUP BY room_id
      //       `;

      //       db.query(findUnreadQuery, [roomIds, myUserId], (err, countResults) => {
      //         if (err) throw err;

      //         const unreadCounts = friendUserIds.map((friendId) => {
      //           const room = rooms.find((room) => room.roomName.includes(friendId));
      //           if (!room) return { friendId, unreadCount: 0 };

      //           const count = countResults.find(
      //             (countResult) => countResult.room_id === room.id
      //           );
      //           const unreadCount = count ? count.unreadCount : 0;
      //           return { friendId, unreadCount };
      //         });

      //         res.json({ status: "success", unreadCounts });
      //       });
      //     } else {
      //       const unreadCounts = friendUserIds.map((friendId) => ({
      //         friendId,
      //         unreadCount: 0,
      //       }));
      //       res.json({ status: "success", unreadCounts });
      //     }
      //   });
      // }
      // 이 부분에서 친구별로 개별 쿼리를 실행해야 합니다.
      Promise.all(
        friendUserIds.map(
          (friendId) =>
            new Promise((resolve, reject) => {
              const findUnreadQuery = `
      SELECT COUNT(*) AS unreadCount, room_id FROM MESSAGE
      WHERE room_id IN (?) AND receiverIsRead = 0 AND senderId = ?
      GROUP BY room_id
      `;

              db.query(
                findUnreadQuery,
                [roomIds, friendId],
                (err, countResults) => {
                  if (err) return reject(err);

                  const room = rooms.find((room) =>
                    room.roomName.includes(friendId)
                  );
                  if (!room) return resolve({ friendId, unreadCount: 0 });

                  const count = countResults.find(
                    (countResult) => countResult.room_id === room.id
                  );
                  const unreadCount = count ? count.unreadCount : 0;
                  resolve({ friendId, unreadCount });
                }
              );
            })
        )
      )
        .then((unreadCounts) => {
          res.json({ status: "success", unreadCounts });
        })
        .catch((err) => {
          throw err;
        });
    } else {
      const unreadCounts = friendUserIds.map((friendId) => ({
        friendId,
        unreadCount: 0,
      }));
      res.json({ status: "success", unreadCounts });
    }
  });
}
