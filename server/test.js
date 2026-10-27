import express from "express";
const app = express();
app.get("/", (req, res) => res.send("hi"));
const server = app.listen(5002, () => console.log("test up"));
server.on("error", (e) => console.error("ERR", e));
