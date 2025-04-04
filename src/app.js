const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;

const usersRouter = require('./routes/users');
const postsRouter = require('./routes/posts');
const commentsRouter = require('./routes/comments');
const notificationsRouter = require('./routes/notifications');

app.use(cors());
app.use(bodyParser.json());

mongoose.connect('mongodb://localhost:27017/olx', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use('/api/users', usersRouter);
app.use('/api/posts', postsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/notifications', notificationsRouter);

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
