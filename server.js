const path = require("path");
var cors = require("cors");

const apiGeneratorController = require("./server/controllers/api-generator.controller.js");

const express = require("express");
const app = express();

// handling CORS
const corsOption = {
  credentials: true,
  origin: ["http://localhost:4200"],
};
app.use(cors(corsOption));
app.use(express.json());

//SERVIDOR
app.listen(3000, () => {
  console.log("Server listening on port 3000");
});

//WEB
var sample = require("./routes/sample.js");
app.use(express.static(path.join(__dirname, "dist")));
app.use("/samples", express.static(path.join(__dirname, "dist")));
app.use("/sample", sample);

//GERADOR DE API
app.get("/api/schema", apiGeneratorController.getSchema);
app.post("/api/generate", apiGeneratorController.generateApi);
