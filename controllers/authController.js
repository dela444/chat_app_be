var bcrypt = require('bcrypt')
const { v4: uuidv4 } = require('uuid')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const { pool } = require('../config')
const {
  storeUsersToRedis,
  storeUserToRedis,
} = require('../helpers/redisHelpers')
const { userValidationSchema } = require('../helpers/validationHelpers')
const CustomError = require('./errorController')

const userValidationCheck = async (req, res, next) => {
  const data = req.body
  try {
    await userValidationSchema.validate(data)
    next()
  } catch (error) {
    next(new CustomError(error.message, 422))
  }
}

const isUsernameTaken = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM chat_users WHERE username = $1;`,
      [req.body.username]
    )

    if (result.rows.length === 0) {
      next()
    } else {
      next(new CustomError('Username is already taken!', 409))
    }
  } catch (err) {
    next(err)
  }
}

const registerUser = async (req, res, next) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10)

    const result = await pool.query(
      `INSERT INTO chat_users (username, password, user_id) VALUES ($1, $2, $3) RETURNING id, username, user_id;`,
      [req.body.username, hash, uuidv4()]
    )

    const token = jwt.sign(
      {
        username: req.body.username,
        id: result.rows[0].id,
        userid: result.rows[0].user_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    await storeUsersToRedis({
      user_id: result.rows[0].user_id,
      username: req.body.username,
    })

    await storeUserToRedis({
      user_id: result.rows[0].user_id,
      username: req.body.username,
    })

    res.status(200).send({
      success: true,
      token,
      username: req.body.username,
    })
  } catch (err) {
    next(err)
  }
}

const isUserAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new CustomError('Invalid Authorization header', 401))
    }

    const token = authHeader.split(' ')[1]
    if (!token || token === 'null') {
      return next(new CustomError('Invalid Authorization header', 401))
    }

    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          reject(err)
        } else {
          resolve(decoded)
        }
      })
    })

    const result = await pool.query(
      `SELECT * FROM chat_users WHERE username = $1;`,
      [decoded.username]
    )

    if (result.rows.length === 0) {
      return next(new CustomError('User does not exist!', 401))
    }

    res.status(200).send({
      authenticated: true,
      token,
      username: result.rows[0].username,
    })
  } catch (err) {
    next(err)
  }
}

const login = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM chat_users WHERE username = $1`,
      [req.body.username]
    )

    if (result.rows.length > 0) {
      const validPassword = await bcrypt.compare(
        req.body.password,
        result.rows[0].password
      )

      if (validPassword) {
        const token = jwt.sign(
          {
            username: req.body.username,
            id: result.rows[0].id,
            userid: result.rows[0].user_id,
          },
          process.env.JWT_SECRET,
          { expiresIn: '1d' }
        )

        await storeUserToRedis({
          user_id: result.rows[0].user_id,
          username: req.body.username,
        })

        res.status(200).send({
          success: true,
          token,
          username: req.body.username,
        })
      } else {
        next(new CustomError('Wrong username or password!', 401))
      }
    } else {
      next(new CustomError('Wrong username or password!', 401))
    }
  } catch (err) {
    next(err)
  }
}

module.exports = {
  userValidationCheck,
  isUsernameTaken,
  registerUser,
  isUserAuthenticated,
  login,
}
