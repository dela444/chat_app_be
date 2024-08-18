const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
require('dotenv').config()
const { Server } = require('socket.io')
const helmet = require('helmet')

const {
  verifySocketUser,
  setUpUser,
  onDisconnection,
  sendMessage,
  joinRoom,
  lastSeenMessage,
  messageSeen,
} = require('./socketio')

var chatRouter = require('./routes/chat')
var authRouter = require('./routes/auth')
const CustomError = require('./controllers/errorController')

const app = express()

const corsOptions = {
  origin: 'http://localhost:3000',
  credentials: true,
}

app.use(cors(corsOptions))
app.use(helmet())
app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))

app.use('/', chatRouter)
app.use('/auth', authRouter)
app.all('*', (req, res, next) => {
  const err = new CustomError(`Route ${req.originalUrl} not found`, 404)
  next(err)
})

app.use((error, req, res, next) => {
  error.statusCode = error.statusCode || 500
  error.status = error.status || 'error'
  if (error.isOperational) {
    res.status(error.statusCode).send({
      success: false,
      status: error.status,
      message: error.message,
    })
  } else {
    res.status(500).send({
      success: false,
      status: error.status,
      message: 'Something went wrong! Please try again later.',
    })
  }
})

const server = require('http').createServer(app)

const io = new Server(server, {
  cors: corsOptions,
})

io.use(verifySocketUser)
io.on('connect', (socket) => {
  setUpUser(socket)
  socket.on('sendMessage', (message) => {
    sendMessage(socket, message)
  })
  socket.on('messageDelivered', (message) => {
    socket.to(message.from).emit('messageDelivered', message)
  })
  socket.on('messagesRead', (userid) => {
    lastSeenMessage(socket, userid)
  })
  socket.on('messageSeen', (data) => {
    messageSeen(socket, data)
  })
  socket.on('joinRoom', (data) => {
    joinRoom(socket, data)
  })
  socket.on('disconnecting', () => {
    onDisconnection(socket)
  })
})

server.listen(process.env.PORT, () => {
  console.log('server started on port 5000')
})
