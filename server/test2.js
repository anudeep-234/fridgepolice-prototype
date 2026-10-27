import express from "express";
import cors from "cors";
import * as inv from "./inventory.js";
const app = express();
app.use(cors());
app.get("/", (req, res) => res.send("hi"));
const server = app.listen(5003, () => console.log("test2 up"));
process.on("exit", (code) => console.log("exit", code));
