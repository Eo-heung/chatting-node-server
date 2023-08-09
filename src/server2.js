import http from "http";
import express from "express";
import SocketIO from "socket.io";
import cors from "cors";

// variable
const PORT = 5000;
const app = express();

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
    socket.to(roomName).emit("ice", ice);
  });
});

const handleListen = () => console.log("Listening on http://localhost:5000");
httpServer.listen(PORT, handleListen);
