import express from "express";
import cors from "cors";
import * as inv from "./inventory.js";

const app = express();
app.use(cors());
app.use(express.json());

const wrap = (fn) => (req, res) => {
  try {
    res.json(fn(req));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

app.get("/state", (req, res) => res.json(inv.getState()));
app.post("/items", wrap((req) => inv.createItem(req.body.name, req.body.owner)));
app.post("/items/:id/request", wrap((req) =>
  inv.requestPortion(req.params.id, req.body.requester, Number(req.body.percent))));
app.post("/holds/:id/consume", wrap((req) => inv.markConsumed(req.params.id)));
app.post("/items/:id/spoil", wrap((req) => inv.spoilItem(req.params.id)));
app.post("/items/:id/correct", wrap((req) =>
  inv.correctCount(req.params.id, Number(req.body.percent))));

const server = app.listen(5000, () => console.log("Server on http://localhost:5000"));
server.on("error", (e) => console.error("Listen error:", e));
