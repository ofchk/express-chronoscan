const cors = require('cors');
const express = require('express');
const app = express();
const path = require('path');

global.__basedir = __dirname;

var corsOptions = {
  origin: 'http://localhost:3010',
};

app.use(cors(corsOptions));
app.use(express.static('static'));
app.get('/', (req, res) => {
  res.sendFile(path.resolve('pages/index.html'));
});
const initRoutes = require('./routes');

app.use(express.urlencoded({ extended: true }));
initRoutes(app);

let port = 3010;
app.listen(port, () => {
  console.log(`Running at localhost:${port}`);
});
