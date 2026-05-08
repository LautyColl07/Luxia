const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const morgan = require('morgan');

const errorHandler = require('./middleware/errorHandler');
const apiRouter = require('./routes');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/v1', apiRouter);

app.use(errorHandler);

module.exports = app;
