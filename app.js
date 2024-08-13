const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser');

const { Server } = require('socket.io')

var indexRouter = require('./routes/index')
var authRouter = require('./routes/auth')

const helmet = require('helmet')
const app = express()

const corsOptions = {
  origin: 'http://localhost:3000',
  optionsSuccessStatus: 200,
  credentials: true
}

app.use(cors(corsOptions))
app.use(helmet())
app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))


//app.use('/', indexRouter)
app.use('/auth', authRouter)

const server = require('http').createServer(app)

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    credentials: 'true'
  }
})

io.on('connect', socket => {})

server.listen(5000, () => {
  console.log('server started on port 5000')
})
