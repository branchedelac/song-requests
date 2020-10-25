// TODO: right now anyone with a Google account is a potential admin. Might want to refine that logic - but how really depends on use and context.

// Require modules

const Promise = require("promise");
const dotenv = require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const findOrCreate = require('mongoose-findorcreate');
const passport = require("passport");
const session = require("express-session");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bodyParser = require("body-parser");
const ejs = require("ejs");
const http = require("http");

// Set up app

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Set up database

mongoose.connect(process.env.DB, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  useCreateIndex: true
});

// Construct admin users

const userSchema = new mongoose.Schema({
  name: String,
  googleId: String,
})

userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

// Set up authentication

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.G_CLIENT_ID,
    clientSecret: process.env.G_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/admin"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      name: profile.name.givenName,
      googleId: profile.id
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

// Construct songRequest object

const songRequestSchema = new mongoose.Schema({
  title: String,
  performer: String,
  requester: String,
  message: String,
  date: Date,
  status: String
})

const SongRequest = new mongoose.model("songRequest", songRequestSchema);

const requestQueue = [];
const requestArchive = [];

// Render public pages

app.get("/", function(req, res) {
  SongRequest.findOne({
    status: "Playing"
  }, function(err, nowPlaying) {
    res.render("home", {
      nowPlaying: nowPlaying,
      adminauth: req.isAuthenticated(),
    })
  });
});

app.get("/list", async function(req, res) {
  try {
    const nowPlaying = await SongRequest.findOne({
      status: "Playing"
    });
    const requestArchive = await SongRequest.find({
      status: "Archived"
    });

    res.render("list", {
      nowPlaying: nowPlaying,
      requestArchive: requestArchive,
      adminauth: req.isAuthenticated()
    })
  } catch (err) {
    console.log(err);
  }
});

app.get("/request", function(req, res) {
  res.render("request", {
    adminauth: req.isAuthenticated()
  })
});


// Post song request

app.post("/request", function(req, res) {
  const currentDate = new Date();
  const newSongRequest = new SongRequest({
    title: req.body.title,
    performer: req.body.performer,
    requester: req.body.requester,
    message: req.body.message,
    date: currentDate,
    status: "New"
  });

  newSongRequest.save(function(err, newSongRequest) {
    if (err) return console.error(err);
    res.redirect("/list")
  });
});


// Log in as admin

app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile"]
  })
);

app.get('/auth/google/admin',
  passport.authenticate('google', {
    failureRedirect: '/login'
  }),
  function(req, res) {
    // Successful authentication, redirect to Admin view.
    res.redirect('/admin');
  });

// Render admin page

app.get("/admin", async function(req, res) {

  if (req.isAuthenticated()) {
    const admin = req.user.name;
    try {
      const nowPlaying = await SongRequest.findOne({
        status: "Playing"
      });
      const requestQueue = await SongRequest.find({
        status: "New"
      });
      const requestArchive = await SongRequest.find({
        status: "Archived"
      });

      res.render("admin", {
        requestQueue: requestQueue,
        requestArchive: requestArchive,
        nowPlaying: nowPlaying,
        adminauth: req.isAuthenticated(),
        admin: admin

      })

    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/auth/google");
  }

});

// Select a song from the queue to play, automatically archiving the one playing

app.post("/admin", function(req, res) {
  SongRequest.findOneAndUpdate({
    status: "Playing"
  }, {
    status: "Archived"
  }, function(err, archived) {
    SongRequest.findByIdAndUpdate(req.body.id, {
      status: "Playing"
    }, function(err, playing) {
      console.log(playing)
      res.redirect("/admin");
    });
  });
});

// Avsluta sessionen och logga ut
app.get("/logout", function(req, res) {
  SongRequest.findOneAndUpdate({
    status: "Playing"
  }, {
    status: "Archived"
  }, function(err, archived) {});

  req.logout();
  res.redirect("/");
});


// Start local server

app.listen(3000, function() {
  console.log("Server started on port 3000");
});
