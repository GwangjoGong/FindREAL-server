const axios = require("axios");
const FormData = require("form-data");

const express = require("express");
const bodyParser = require("body-parser");
const logger = require("morgan");
const cors = require("cors");
const e = require("express");

const app = express();
const port = process.env.PORT || 3000;

const MongoClient = require("mongodb").MongoClient;

const connectionString = process.env.DB || "mongodb://127.0.0.1:27017/";

MongoClient.connect(connectionString, { useUnifiedTopology: true })
  .then((client) => {
    console.log("Connected to database!");

    const db = client.db("test");

    const userCollection = db.collection("users");
    const requestsCollection = db.collection("requests");

    app.use(logger("dev"));
    app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
    app.use(bodyParser.json());
    app.use(cors());
    app.use(express.static("static"));

    app.post("/signup", async (req, res) => {
      var email = req.body.email;

      var existingUser = await userCollection.findOne({
        email,
      });

      if (existingUser) {
        return res.json({
          success: true,
          token: existingUser.email,
        });
      }

      userCollection
        .insertOne({
          name: "Guest",
          email,
          profile: process.env.DUMMY_URL,
          service: "beginner",
        })
        .then((result) => {
          return res.json({
            success: true,
            token: email,
          });
        })
        .catch((err) =>
          res.json({
            success: false,
            message: err.message,
          })
        );
    });

    app.post("/profile", (req, res) => {
      userCollection
        .findOne({
          email: req.body.email,
        })
        .then((user) =>
          res.json({
            success: true,
            user,
          })
        )
        .catch((err) => {
          res.json({
            success: false,
            message: err.message,
          });
        });
    });

    app.post("/new_request", async (req, res) => {
      var base64 = req.body.image;
      var email = req.body.email;

      const url = process.env.MODEL_API_URL || "http://localhost:5000/";

      try {
        const data = new FormData();
        data.append("image", base64);

        const response = await axios.post(url, data, {
          headers: {
            "Content-Type": `multipart/form-data; boundary=${data._boundary}`,
            "Content-Length": data.getLengthSync(),
          },
        });

        const user = await userCollection.findOne({
          email,
        });

        if (!user)
          return res.json({
            success: false,
            message: "No user founded",
          });

        var now = new Date();
        var created = now.toISOString().substring(0, 16).replace("T", " ");
        now.setSeconds(now.getSeconds() + 30);

        await requestsCollection.insertOne({
          user: email,
          created,
          available: now.toISOString(),
          real: response.data.real ? response.data.real : -1,
          fake: response.data.fake ? response.data.fake : -1,
          error: response.data.error ? response.data.error : null,
          image: base64,
          service: user.service,
        });

        return res.json({
          success: true,
        });
      } catch (err) {
        return res.json({
          success: false,
          message: err.message,
        });
      }
    });

    app.post("/requests", (req, res) => {
      var email = req.body.email;

      requestsCollection
        .find({
          user: email,
        })
        .toArray((err, result) => {
          if (err)
            return res.json({
              success: false,
              message: err.message,
            });

          const now = new Date();

          const done = [];
          const progress = [];

          for (const req of result) {
            const avail = new Date(req.available);
            if (avail < now) {
              done.push(req);
            } else {
              progress.push(req);
            }
          }

          return res.json({
            done,
            progress,
          });
        });
    });

    app.post("/init_requests", (req, res) => {
      if (req.body.passswd == "qwerty") {
        requestsCollection.deleteMany({}).then(() =>
          res.json({
            success: true,
          })
        );
      } else {
        res.json({
          success: false,
          message: "Unauthorized",
        });
      }
    });

    app.post("/init_users", (req, res) => {
      if (req.body.passwd == process.env.ADMIN_PASSWD) {
        userCollection.deleteMany({}).then(() =>
          res.json({
            success: true,
          })
        );
      } else {
        res.json({
          success: false,
          message: "Unauthorized",
        });
      }
    });

    app.get("/all", (req, res) => {
      requestsCollection.find({}).toArray((_, result) => {
        res.json(result);
      });
    });

    app.listen(port, function () {
      console.log(`listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
  });
