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
  pool.connect(function (err, client, done) {
    if (err) {
      return next(err)
    } else {
      client.query(
        `INSERT INTO messages (message, message_id, user_id) VALUES ($1,$2,$3) RETURNING id, message, message_id;`,
        [req.body.message, uuidv4(), req.body.userid],
        function (err, result) {
          done()
          if (err) {
            return next(err)
          } else {
            res.status(200).send({
              success: true,
              message: result.rows[0].message,
              message_id: result.rows[0].message_id,
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
