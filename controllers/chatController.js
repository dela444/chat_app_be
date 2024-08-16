const { v4: uuidv4 } = require('uuid')

const { pool } = require('../config')
const { storeRoomsToRedis } = require('../helpers/redisHelpers')
const {
  roomValidationSchema,
  messageValidationSchema,
} = require('../helpers/validationHelpers')

const roomValidationCheck = async (req, res, next) => {
  const data = req.body
  try {
    const valid = await roomValidationSchema.validate(data)
    if (valid) {
      next()
    } else {
      res.status(422).send({ success: false, message: 'Invalid room name!' })
    }
  } catch (error) {
    res.status(422).send({ success: false, message: error.message })
  }
}

const isRoomNameTaken = (req, res, next) => {
  pool.connect(function (err, client, done) {
    if (err) {
      return next(err)
    } else {
      client.query(
        `SELECT * FROM chat_rooms WHERE name=$1;`,
        [req.body.name],
        function (err, result) {
          done()
          if (err) {
            return next(err)
          } else {
            if (result.rows.length === 0) {
              next()
            } else {
              res.send({
                success: false,
                message: 'Name is already taken!',
              })
            }
          }
        }
      )
    }
  })
}

const createChatRoom = (req, res, next) => {
  pool.connect(function (err, client, done) {
    if (err) {
      return next(err)
    } else {
      client.query(
        `INSERT INTO chat_rooms (name, room_id) VALUES ($1,$2) RETURNING id, name, room_id;`,
        [req.body.name, uuidv4()],
        function (err, result) {
          done()
          if (err) {
            return next(err)
          } else {
            storeRoomsToRedis({
              room_id: result.rows[0].room_id,
              name: result.rows[0].name,
            })
            res.status(200).send({ success: true })
          }
        }
      )
    }
  })
}

const messageValidationCheck = async (req, res, next) => {
  const data = req.body
  try {
    const valid = await messageValidationSchema.validate(data)
    if (valid) {
      next()
    } else {
      res.status(422).send({ success: false, message: 'Invalid message!' })
    }
  } catch (error) {
    res.status(422).send({ success: false, message: 'Invalid message!' })
  }
}

const createMessage = (req, res, next) => {
  const formattedTime = new Date().toLocaleString().split(' ')[1].slice(0, 5)
  pool.connect(function (err, client, done) {
    if (err) {
      return next(err)
    } else {
      client.query(
        `INSERT INTO messages (content, message_id, sender_id, recipient_id, recipient_type, creation_time) VALUES ($1,$2,$3,$4,$5,$6) RETURNING content, message_id, creation_time;`,
        [
          req.body.message,
          uuidv4(),
          req.body.from,
          req.body.recipient_id,
          req.body.recipient_type,
          formattedTime,
        ],
        function (err, result) {
          done()
          if (err) {
            return next(err)
          } else {
            res.status(200).send({
              success: true,
              message: result.rows[0].content,
              message_id: result.rows[0].message_id,
              creation_time: result.rows[0].creation_time,
            })
          }
        }
      )
    }
  })
}

module.exports = {
  roomValidationCheck,
  isRoomNameTaken,
  createChatRoom,
  messageValidationCheck,
  createMessage,
}
