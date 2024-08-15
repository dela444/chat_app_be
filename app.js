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
} = require('./socketio')

var chatRouter = require('./routes/chat')
var authRouter = require('./routes/auth')

const app = express()

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
}

app.use(cors(corsOptions))
app.use(helmet())
app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))

app.use('/', chatRouter)
app.use('/auth', authRouter)

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
  socket.on('joinRoom', (data) => {
    joinRoom(socket, data)
  })
  socket.on('disconnecting', () => {
    onDisconnection(socket)
  })
})

server.listen(5000, () => {
  console.log('server started on port 5000')
})
