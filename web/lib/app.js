'use strict'
import path from 'path';
import http from 'http';

import express from 'express';
//express middleware
import morgan from 'morgan';
import compression from 'compression';
import errorHandler from 'errorhandler';
import bodyParser from 'body-parser';
import winston from 'winston';

import configureApiRoutes from './api';

const APP_SERVER_PORT = process.env.NODE_ENV === 'production' ? 80 : 3000;
const MAX_AGE = '31536000';
const PUBLIC_STATIC_CACHING = process.env.NODE_ENV === 'development' ? {} : { 
  maxAge: MAX_AGE,
  setHeaders: (res) => {
    res.setHeader('Cache-Control',`public, max-age=${MAX_AGE}`);
  }
};

// configure express and its middleware
const app = express();
app.enable('trust proxy');
app.set('port',APP_SERVER_PORT);
app.use(compression());

// configure logging
app.logger = new (winston.Logger)({
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'error' : 'info',
      colorize: true,
      timestamp: true
    })
  ]
});
app.use(morgan('combined',{ stream: {
  write: message => app.logger.verbose(message)
}}));

app.use(bodyParser.json());
if (process.env.NODE_ENV !== 'production') {
  app.use(errorHandler({ dumpExceptions: true, showStack: true }));
}

configureAuth(app);
configureRoutes(app);
configureApiRoutes(app);
startServer(app);

function configureAuth(app) {
    // TODO set up http basic auth authenticating from pwauth
}

function configureRoutes(app) {
  app.use(express.static(path.join(__dirname,'..','public'),PUBLIC_STATIC_CACHING));

  /**
   * when running in dev mode without using the webpack-dev-server, we don't want
   * the app to try and handle requests coming from the client that are intended
   * for the webpack-dev-server
   */
  app.get('/socket.io*',function(req,res) {
      const message = 'You are not running this application via webpack-dev-server. Browse to this application using the webpack-dev-server port to enable webpack support';
      app.logger.warn(message);
      res.statusCode = 502;
      res.write(message);
      res.end();
  });

  /**
   * handle rendering of the UI
   */
  app.get('/*',(req,res) => {
    res.sendFile(path.join(__dirname,'..','public','index.html'));
  });
}

function startServer(app) {
    const server = http.createServer(app)
    let started = false;
    server.listen(APP_SERVER_PORT, () => {
        app.logger.info('Express server awaiting connections');
        started = true;
    }).on('error',err=> {
      if (started) {
        app.logger.error(err.stack);
      }
      else if (err.code === 'EACCES') {
        app.logger.error(`Unable to listen on port ${APP_SERVER_PORT}. This is usually due to the process not having permissions to bind to this port. Did you mean to run the server in dev mode with a non-priviledged port instead?`);
      }
      else if (err.code === 'EADDRINUSE') {
        app.logger.error(`Unable to listen on port ${APP_SERVER_PORT} because another process is already listening on this port. Do you have another instance of the server already running?`);
      }
    });

  process.on('SIGTERM', function() {
      app.logger.info('SIGTERM received, draining connections...');
      server.close(() => {
        app.logger.verbose('Express server closed. Terminating process');
      });
  });
}
